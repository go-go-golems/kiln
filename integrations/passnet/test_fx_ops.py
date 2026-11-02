import unittest
from fx_ops import Op, Lowered, Registry, bind


class RegistryTests(unittest.TestCase):
    def test_a_spelling_belongs_to_one_operation(self):
        registry = Registry()
        registry.register(Op('a', lambda c: Lowered('x'), frozenset({'torch.relu'}), frozenset({'relu'})))
        with self.assertRaisesRegex(ValueError, 'declared by both a and b'):
            registry.register(Op('b', lambda c: Lowered('x'), frozenset({'torch.relu'})))
        # the same bare name may exist once per node kind
        registry.register(Op('c', lambda c: Lowered('x'), frozenset({'relu'})))
        self.assertEqual(registry.lookup('call_method', 'relu').name, 'a')
        self.assertEqual(registry.lookup('call_function', 'relu').name, 'c')
        self.assertIsNone(registry.lookup('call_method', 'torch.relu'))

    def test_importer_registry_loads_without_conflicts(self):
        from fx_import import REGISTRY
        self.assertEqual(REGISTRY.lookup('call_function', '_operator.iadd').name, 'inplace_binary')
        self.assertFalse(REGISTRY.lookup('call_method', 'view').fresh)
        self.assertTrue(REGISTRY.lookup('call_function', 'torch.conv2d').fresh)

    def test_bind_diagnostics(self):
        self.assertEqual(bind('n', 'op', ('x',), {'dim': '1'}, ['input', 'dim']), {'input': 'x', 'dim': '1'})
        with self.assertRaisesRegex(ValueError, 'n: duplicate op argument'):
            bind('n', 'op', ('x', '1'), {'dim': '1'}, ['input', 'dim'])
        with self.assertRaisesRegex(ValueError, 'n: unsupported op arguments'):
            bind('n', 'op', (), {'other': '1'}, ['input'])
        with self.assertRaisesRegex(ValueError, 'n: op input required'):
            bind('n', 'op', (), {}, ['input'])


if __name__ == '__main__': unittest.main()
