import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

class ImportTests(unittest.TestCase):
    def test_transpose_bindings_share_static_semantics(self):
        class Model(torch.nn.Module):
            def __init__(self,mode):super().__init__();self.mode=mode
            def forward(self,x):
                if self.mode=='function':return torch.transpose(x,-1,0)
                if self.mode=='keywords':return torch.transpose(input=x,dim0=-1,dim1=0)
                if self.mode=='method':return x.transpose(dim0=-1,dim1=0)
                return torch.ops.aten.transpose.int(x,-1,0)
        for shape in [(2,3,4),(5,),()]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                scripts=[]
                for mode in ['function','keywords','method','aten']:
                    result=import_graph(export_graph(symbolic_trace(Model(mode)),(torch.randn(shape).to(dtype),)))
                    scripts.append(result['script'])
                self.assertTrue(all(script==scripts[0] for script in scripts))
                self.assertIn('N.transpose' if shape else 'N.reshape',scripts[0])

    def test_transpose_argument_and_metadata_errors(self):
        import copy
        class Model(torch.nn.Module):
            def forward(self,x):return torch.transpose(x,0,1)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        def edited(change):
            value=copy.deepcopy(graph);node=next(n for n in value['nodes'] if n['target']=='torch.transpose');change(node);return value
        for axis in [True,2,-3]:
            with self.assertRaisesRegex(ValueError,'transpose dimensions'):
                import_graph(edited(lambda n:n['args']['tuple'].__setitem__(1,axis)))
        with self.assertRaisesRegex(ValueError,'duplicate transpose'):
            import_graph(edited(lambda n:n['kwargs']['dict'].update(dim0=0)))
        with self.assertRaisesRegex(ValueError,'output shape'):
            import_graph(edited(lambda n:n['tensor_meta'].update(shape=[2,3])))
        with self.assertRaisesRegex(ValueError,'dtype-preserving'):
            import_graph(edited(lambda n:n['tensor_meta'].update(dtype='torch.float16')))

    def test_transpose_does_not_grant_mutation_ownership(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.relu(torch.transpose(x,0,1),inplace=True)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        with self.assertRaisesRegex(ValueError,'fresh unaliased'):import_graph(graph)

    def test_relu_add_roundtrip_structure(self):
        class Model(torch.nn.Module):
            def forward(self, x, y):
                return (torch.relu(x) + y, [x])
        graph = export_graph(symbolic_trace(Model()), (torch.randn(2,3), torch.randn(3)))
        lowered = import_graph(graph)
        self.assertIn('N.relu', lowered['script'])
        self.assertIn('N.add', lowered['script'])
        self.assertEqual(lowered['output_structure'], {'tuple':[{'output':'out0'}, {'list':[{'output':'out1'}]}]})

    def test_low_precision_elementwise(self):
        class Model(torch.nn.Module):
            def forward(self, x, y): return (x+y)*0.5
        for dtype, name in [(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3).to(dtype),torch.randn(2,3).to(dtype)))
            result=import_graph(graph)
            self.assertEqual(set(result['input_dtypes'].values()),{name})
            self.assertIn('"'+name+'"',result['script'])

    def test_normalization_accumulation_casts(self):
        class Model(torch.nn.Module):
            def forward(self,mean,var,bias,weight,x):
                return torch.nn.functional.batch_norm(x,mean,var,weight,bias,False,0.1,1e-5)
        for dtype,name in [(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            values=(torch.zeros(3,dtype=dtype),torch.ones(3,dtype=dtype),torch.zeros(3,dtype=dtype),torch.ones(3,dtype=dtype),torch.randn(2,3).to(dtype))
            result=import_graph(export_graph(symbolic_trace(Model()),values))
            self.assertIn('N.cast(v4, "f32")',result['script'])
            self.assertIn(', "'+name+'")',result['script'])

    def test_divide_transpose_task_pattern(self):
        class Model(torch.nn.Module):
            def forward(self,x): return (x/1.6817928305074292).transpose(-1,-2)
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4).to(dtype),)))
            self.assertIn('N.div',result['script'])
            self.assertIn('N.transpose',result['script'])

    def test_conv_relu_residual_resize(self):
        class Model(torch.nn.Module):
            def forward(self,b,w,residual,x):
                y=torch.conv2d(x,w,b,(2,2),(1,1),(1,1),1)
                y=torch.nn.functional.relu(y,inplace=True)
                return torch.nn.functional.interpolate(residual+y,size=(5,5),mode='bilinear',align_corners=False)
        values=(torch.randn(3),torch.randn(3,2,3,3),torch.randn(1,3,3,3),torch.randn(1,2,5,5))
        result=import_graph(export_graph(symbolic_trace(Model()),values))
        self.assertIn('N.conv2d',result['script']);self.assertIn('N.resizeBilinear',result['script'])

    def test_single_use_input_mutation_exports_effect_and_alias(self):
        class Model(torch.nn.Module):
            def forward(self,x): return torch.nn.functional.relu(x,inplace=True)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        result=import_graph(graph)
        self.assertEqual(result['input_mutations'],[{'input_index':0,'output':'__mut0'}])
        self.assertEqual(result['output_structure'],{'input_alias':0})
        self.assertIn('__mut0:',result['script'])

    def test_input_mutation_rebinds_every_name_of_the_chain(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                y=x.add_(1)
                return x+y
        # x and y both name the updated input: x + y reads the new value twice
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertIn('N.add(v1, v1)',result['script'])
        self.assertEqual(result['input_mutations'],[{'input_index':0,'output':'__mut0'}])

    def test_input_mutation_with_a_live_view_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                v=x.view(6)
                x.add_(1)
                return v*2
        with self.assertRaisesRegex(ValueError,'view of it is read later'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))

    def test_reduction_axes_and_dtype(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.mean(dim=(-1,0),keepdim=False)
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4).to(dtype),)))
            self.assertIn('N.sum',result['script']);self.assertIn('N.reshape',result['script'])
            self.assertIn('0.125',result['script'])

    def test_layout_and_cast_chain(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                return x.permute(0,2,1).contiguous().reshape(2,12).half().float()
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),)))
        self.assertIn('N.transpose',result['script']);self.assertIn('N.reshape',result['script']);self.assertIn('N.cast',result['script'])

    def test_explicit_dtype_cast(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.to(dtype=torch.float16)
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertIn('N.cast(v0, "f16")',result['script'])

    def test_dynamic_reshape_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.reshape(6,4)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),))
        # Import must not silently substitute recorded metadata for a runtime shape.
        node=next(n for n in graph['nodes'] if n.get('target')=='reshape')
        node['args']['tuple'][1]={'ref':graph['nodes'][0]['id']}
        with self.assertRaises(ValueError): import_graph(graph)

    def test_cast_without_dtype_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.to(dtype=torch.float16)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        node=next(n for n in graph['nodes'] if n.get('target')=='to')
        node['kwargs']={'dict':{}}
        with self.assertRaisesRegex(ValueError,'explicit dtype'): import_graph(graph)

    def test_basic_static_indexing(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[:,1:-1,-2,None]
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,5,4),)))
        self.assertIn('N.slice',result['script']);self.assertIn('[2, 3, 1]',result['script'])

    def test_ellipsis_indexing(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[...,1,None]
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),)))
        self.assertIn('[2, 3, 1]',result['script'])

    def test_strided_indexing(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[:,1::2]
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,7),)))
        self.assertIn('N.slice(v0, 1, 1, 7, 2)',result['script'])

    def test_concatenation_promotion(self):
        class Model(torch.nn.Module):
            def forward(self,x,y): return torch.cat((x,y),dim=-1)
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3).half(),torch.randn(2,1).bfloat16())))
        self.assertIn('N.concat',result['script'])
        self.assertIn('N.cast(v0, "f32")',result['script'])
        self.assertIn('N.cast(v1, "f32")',result['script'])

    def test_dtype_and_layout_rejected(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return torch.relu(x)
        with self.assertRaisesRegex(ValueError, 'noncontiguous'):
            import_graph(export_graph(symbolic_trace(Model()), (torch.randn(2,3).t(),)))
        # integer arithmetic imports faithfully; the compiler refuses it by name (integer-storage.mjs)
        self.assertIn('N.relu(v0)', import_graph(export_graph(symbolic_trace(Model()), (torch.ones(2,3,dtype=torch.int64),)))['script'])

    def test_gathers(self):
        class Model(torch.nn.Module):
            def forward(self, table, ids, w, x, sel):
                return (table.view(-1, 3)[ids.view(-1)], torch.nn.functional.embedding(ids, w, None, None, 2.0, False, False),
                        x.index_select(-2, sel), x[:, sel])
        ids, sel = torch.zeros(2, 5, dtype=torch.int64), torch.zeros(4, dtype=torch.int64)
        script = import_graph(export_graph(symbolic_trace(Model()), (torch.randn(4, 3), ids, torch.randn(7, 6), torch.randn(3, 9, 2), sel)))['script']
        self.assertIn('N.gather(', script)
        self.assertIn(', 0, true)', script)
        self.assertIn('N.embedding(v1, v2)', script)
        self.assertIn('N.indexSelect(v3, -2, v4)', script)
        self.assertIn('N.gather(v3, v4, 1, true)', script)
        class Masked(torch.nn.Module):
            def forward(self, x, m): return x[m]
        with self.assertRaisesRegex(ValueError, 'torch.bool tensor index unsupported'):
            import_graph(export_graph(symbolic_trace(Masked()), (torch.randn(4), torch.ones(4, dtype=torch.bool))))
        class Renorm(torch.nn.Module):
            def forward(self, ids, w): return torch.nn.functional.embedding(ids, w, None, 1.0)
        with self.assertRaisesRegex(ValueError, 'max_norm mutates'):
            import_graph(export_graph(symbolic_trace(Renorm()), (ids, torch.randn(7, 6))))

    def test_integer_storage_passes_through(self):
        class Model(torch.nn.Module):
            def forward(self, ids, mask, x):
                return ids.view(-1, 1), ids.long(), mask.view(2, 3), x * 2
        imported = import_graph(export_graph(symbolic_trace(Model()), (torch.ones(2, 3, dtype=torch.int64), torch.ones(2, 3, dtype=torch.bool), torch.randn(2, 3))))
        self.assertEqual(imported['input_dtypes'], {'v0': 'i64', 'v1': 'bool', 'v2': 'f32'})
        self.assertIn('N.expect(N.reshape(v0, [6, 1]), [6, 1], "i64")', imported['script'])
        self.assertIn('N.cast(v0, "i64")', imported['script'])
        with self.assertRaisesRegex(ValueError, 'unsupported cast dtype'):
            class Narrow(torch.nn.Module):
                def forward(self, ids): return ids.to(torch.int16)
            import_graph(export_graph(symbolic_trace(Narrow()), (torch.ones(2, dtype=torch.int64),)))

    def test_integer_division(self):
        """KILN-011: each FX spelling of //, %, fmod and torch.div with a rounding mode."""
        class Model(torch.nn.Module):
            def forward(self, a, b):
                return (a // b, a % 80, torch.div(a, 14, rounding_mode='trunc'), torch.fmod(a, b), a.floor_divide(b),
                        torch.remainder(a, b), torch.div(a, b), a.div(b, rounding_mode='floor'), 7 // b, torch.floor_divide(a, 3),
                        a.fmod(b), a.__mod__(b), a.__floordiv__(b), torch.div(a, b, rounding_mode=None))
        a, b = torch.tensor([7, -7, 0, 100]), torch.tensor([2, -2, 3, -9])
        script = import_graph(export_graph(symbolic_trace(Model()), (a, b)))['script']
        for text in ['N.floordiv(v0, v1), [4], "i64"', 'N.remainder(v0, N.int(80))', 'N.div(v0, N.int(14), "trunc")', 'N.fmod(v0, v1)',
                     'N.remainder(v0, v1)', 'N.div(v0, v1), [4], "f32"', 'N.div(v0, v1, "floor")', 'N.floordiv(N.int(7), v1)',
                     'N.floordiv(v0, N.int(3))']:
            self.assertIn(text, script)
        self.assertEqual(script.count('N.floordiv(v0, v1)'), 3)
        self.assertEqual(script.count('N.div(v0, v1), [4], "f32"'), 2)
        int32 = import_graph(export_graph(symbolic_trace(Model()), (a.int(), b.int())))['script']
        self.assertIn('N.remainder(v0, N.int(80)), [4], "i32"', int32)

        class InPlace(torch.nn.Module):
            def forward(self, a, b):
                q = a + 0
                q //= b
                r = a + 1
                r %= 16
                return q, r
        from fx_trace import trace_module
        script = import_graph(export_graph(trace_module(InPlace()), (a, b)))['script']
        self.assertIn('N.floordiv(', script)
        self.assertIn('N.remainder(', script)

        class Floating(torch.nn.Module):
            def forward(self, x): return x // 2
        self.assertIn('N.floordiv(v0, N.int(2)), [3], "f32"', import_graph(export_graph(symbolic_trace(Floating()), (torch.randn(3),)))['script'])
        with self.assertRaisesRegex(ValueError, 'floordiv over torch.float16 is not lowered'):
            import_graph(export_graph(symbolic_trace(Floating()), (torch.randn(3).half(),)))
        class Mixed(torch.nn.Module):
            def forward(self, a): return torch.div(a, 2.0, rounding_mode='floor')
        self.assertIn('N.div(v0, 2.0, "floor"), [4], "f32"', import_graph(export_graph(symbolic_trace(Mixed()), (a,)))['script'])
        import copy
        graph = export_graph(symbolic_trace(Model()), (a, b))
        bad = copy.deepcopy(graph)
        node = next(n for n in bad['nodes'] if n['target'] == 'torch.div' and n['kwargs']['dict'])
        node['kwargs']['dict']['rounding_mode'] = '"round"'
        with self.assertRaisesRegex(ValueError, 'unsupported div rounding_mode'):
            import_graph(bad)

    def test_integer_arithmetic(self):
        """P3a slice 3: integer scalars keep their category; comparisons, masks, cumsum, max values."""
        class Positions(torch.nn.Module):
            def forward(self, ids):
                mask = ids.ne(1).int()
                return (torch.cumsum(mask, dim=1).type_as(mask) * mask).long() + 1, ids * 1e6
        script = import_graph(export_graph(symbolic_trace(Positions()), (torch.ones(2, 6, dtype=torch.int64),)))['script']
        self.assertIn('N.ne(v0, N.int(1))', script)
        self.assertIn('N.cast(', script); self.assertIn('"i32"', script)
        self.assertIn('N.cumsum(', script)
        self.assertIn('N.mul(v0, 1000000.0)', script)

        class Wide(torch.nn.Module):
            def forward(self, x): return x + 9007199254740993
        # past 2^53 an integer operand is spelled as a BigInt, which a JS number would round
        self.assertIn('N.int(9007199254740993n)', import_graph(export_graph(symbolic_trace(Wide()), (torch.zeros(2, dtype=torch.int64),)))['script'])
        class WideFill(torch.nn.Module):
            def forward(self, x): return x + torch.full_like(x, 9007199254740993)
        with self.assertRaisesRegex(ValueError, 'not exact as a JS number'):
            import_graph(export_graph(symbolic_trace(WideFill()), (torch.zeros(2, dtype=torch.int64),)))

        class Rerank(torch.nn.Module):
            def forward(self, ids, ones):
                t = ones.cumsum(-1) - 1
                t.masked_fill_(ids.__eq__(0), 1)
                return t.unsqueeze(0).expand(3, -1, -1).max(0, keepdim=False)[0].max(-1, keepdim=True)[0] + 1
        script = import_graph(export_graph(symbolic_trace(Rerank()), (torch.ones(2, 6, dtype=torch.int64), torch.ones(2, 6, dtype=torch.int64))))['script']
        self.assertIn('N.eq(v0, N.int(0))', script)
        # rebinding: the use of t after masked_fill_ reads the filled value
        import re
        filled = re.search(r'const (v\d+) = N.expect\(N.maskedFill\(', script).group(1)
        self.assertRegex(script, rf'N.reshape\({filled}, \[1, 2, 6\]\)')
        self.assertIn('N.amax(', script)

        class Indices(torch.nn.Module):
            def forward(self, x): return x.max(-1)[1]
        self.assertIn('N.argmax(', import_graph(export_graph(symbolic_trace(Indices()), (torch.randn(2, 3),)))['script'])

        class Aliased(torch.nn.Module):
            def forward(self, x, m):
                y = x + 1
                v = y.view(-1)
                y.masked_fill_(m, 0.0)
                return v
        with self.assertRaisesRegex(ValueError, 'fresh unaliased'):
            import_graph(export_graph(symbolic_trace(Aliased()), (torch.randn(2, 3), torch.ones(2, 3, dtype=torch.bool))))



class ActivationImportTests(unittest.TestCase):
    def test_activation_operation_boundaries_widen_and_narrow(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(x),x.sigmoid(),torch.sigmoid(x)
        for dtype,name in [(torch.float32,'f32'),(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            imported=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3).to(dtype),)))
            self.assertIn('N.silu(N.cast(v0, "f32"))',imported['script'])
            self.assertEqual(imported['script'].count('N.sigmoid(N.cast(v0, "f32"))'),2)
            self.assertIn(', "'+name+'")',imported['script'])

    def test_inplace_silu_exports_input_effect(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(x,inplace=True)
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertEqual(result['input_mutations'],[{'input_index':0,'output':'__mut0'}])
        self.assertEqual(result['output_structure'],{'input_alias':0})

    def test_sigmoid_out_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x,y):return torch.sigmoid(x,out=y)
        with self.assertRaisesRegex(ValueError,'arguments'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),torch.empty(2,3))))


class OwnedActivationTests(unittest.TestCase):
    def test_single_use_fresh_activation_can_be_functionalized(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(torch.relu(x),inplace=True)
        imported=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertIn('N.silu',imported['script'])

    def test_alias_observer_prevents_functionalization(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                owned=torch.relu(x)
                view=owned.view(2,3)
                changed=torch.nn.functional.silu(owned,inplace=True)
                return changed,view
        with self.assertRaisesRegex(ValueError,'fresh unaliased'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))

    def test_potentially_aliasing_view_not_owned(self):
        class Live(torch.nn.Module):
            def forward(self,x):
                r=torch.relu(x)
                return torch.nn.functional.silu(r.view(2,3),inplace=True),r
        with self.assertRaisesRegex(ValueError,'fresh unaliased'):
            import_graph(export_graph(symbolic_trace(Live()),(torch.randn(2,3),)))
        class Dead(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(torch.relu(x).view(2,3),inplace=True)
        # the view's source is never read again: the in-place update is a rebinding of the view
        self.assertIn('N.silu',import_graph(export_graph(symbolic_trace(Dead()),(torch.randn(2,3),)))['script'])


class ExpectBindingTests(unittest.TestCase):
    def test_every_value_is_bound_to_its_fx_type(self):
        import torch
        from fx_trace import trace_module
        from fx_export import export_graph
        class M(torch.nn.Module):
            def forward(self, x, s):
                a, b = (x * s).chunk(2, dim=1)
                return a + 1, b
        script = import_graph(export_graph(trace_module(M()), [torch.randn(2, 4).half(), torch.tensor(2.0)]))['script']
        # s is a 0-d input, a CUDA tensor in the evaluator: CUDA converts it to x's dtype first
        self.assertIn('const v2 = N.expect(N.mul(v0, N.cast(v1, "f16")), [2, 4], "f16");', script)
        self.assertIn('N.expect(N.slice(v2, 1, 0, 2), [2, 2], "f16")', script)


if __name__ == '__main__':
    unittest.main()
