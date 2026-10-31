#!/usr/bin/env python3
"""Write the technical milestone from complete qualification and reference-agent evidence."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';coverage=json.loads((s/'kiln-coverage.json').read_text());facts=json.loads((s/'singleton-view-source-cohort-v1-verified-facts.json').read_text());agent=json.loads((s/'original-agent-smoke-terminal-v1/verified-facts.json').read_text())
assert (coverage['tasks_verified'],coverage['graphs_verified'],coverage['graphs_in_complete_tasks'])==(31,358,289)
assert (facts['tasks_nominal_accepted'],facts['graphs_nominal_accepted'],facts['unexecuted_graphs'])==(4,20,33)
assert agent['all_evaluations_rejected_at_matching'] and agent['top_level_reward_is_placeholder']
body='''# Singleton view contracts and an audited failure of the original agent

A singleton dimension has size one. A benchmark task groups concrete program variants with related operation structure. Kiln now imports the operations that insert and remove singleton dimensions through its existing reshape operation. Twelve independent CUDA fixture programs pass all72 finite output comparisons, and full-family qualification adds four complete tasks and20 individual graphs. Cumulative accepted replay reaches31/200 complete tasks and358/2060 individual graphs. A separate import audit reaches1251 graphs and76 complete families. Import eligibility and accepted execution remain different measurements.

PassAgent writes compiler passes using a language model and calls PassBench to test them. The original reference run also finishes in this milestone. Its50-step shipping smoke produces seven evaluator calls, all rejected before candidate correctness or timing, and a best evaluator score of0.1. The original trajectory nevertheless contains reward1.0 because the checked-out runtime uses an explicit reward stub. An additional diagnostic confirms that the original pattern tracer creates a matching discrepancy on the exact DGX evaluator runtime. These findings establish useful reference evidence, but they do not constitute a successful agent optimization or a full paper reproduction.

> [!summary]
> Four complete task families and20 individual graphs are newly accepted. Two evaluated graphs fail the unchanged nominal numerical criterion, and33 variants remain unexecuted after their family stops at an export check. The reference agent completes its operational loop, while its placeholder reward is excluded and its matching failure is investigated independently.

## 1. Start with the tensor contract

A shape is the ordered list of dimension sizes; an axis is an index into that list. Unsqueeze inserts a unit dimension, while squeeze removes selected unit dimensions. These operations preserve logical values without requiring new arithmetic on them.

For example, a tensor with shape `[2,3]` can be expanded at axis1 to shape `[2,1,3]`. Its logical element at `[i,0,j]` is the original element at `[i,j]`. Squeezing axis1 reverses that shape change. Squeezing axis0 in the original `[2,3]` shape leaves it unchanged because that axis has size two. A correct implementation must preserve these distinctions rather than treating every squeeze as unconditional dimension removal.

The importer already has a shape-preserving, dtype-checked route to `N.reshape`. The new source binder computes the required output shape from the source operation and then invokes that shared route. It does not infer the operation solely from supplied result metadata. A malformed graph with the same element count but the wrong singleton position must still be rejected.

An equivalent Kiln expression for the example is:

```javascript
const expanded = N.reshape(x, [2, 1, 3]);
```

This is an illustration of the emitted operation, not a new frontend API. The actual binder is `lower_singleton_view` in `integrations/passnet/fx_indexing.py`, used by `fx_import.py` for Tensor methods, public torch functions and explicit ATen overloads.

## 2. Establish legality before lowering

For rank r, unsqueeze accepts an axis from `-r-1` through r. Negative axes are normalized against r+1 because the insertion positions belong to the output rank. Squeeze normalizes explicit axes against the input rank, with the scalar convention allowing axis0 or-1 as a no-op. Confusing these normalization ranges produces errors at the first or final insertion position even when interior examples work.

Squeeze without an axis removes every dimension whose size is one. An explicit axis list removes only selected unit dimensions; selected non-unit dimensions remain. An empty axis list removes nothing. The binder rejects duplicate axes after negative-index normalization, invalid overload forms, unsupported noninteger axes, and metadata that disagrees with the independently computed shape or dtype. Explicit None is kept distinct from an omitted argument, following the supported source-call contract and archived installed-runtime probes.

The legality argument follows directly from logical indexing. For a row-major shape s, define the flattened logical position as

\\[
F(c;s)=\\sum_k c_k\\prod_{j>k}s_j.
\\]

Inserting a unit axis contributes a coordinate equal to zero. Its new term is therefore zero, and multiplying another coordinate's stride by one changes nothing. Removing a unit axis reverses the same argument. The ordered non-unit dimensions and logical value order remain unchanged. This is exactly the case handled by Kiln's existing singleton reshape coordinate canonicalization.

The proof concerns logical coordinates. A preceding transpose can change their relationship to physical storage. The compiler composes the reshape coordinate map with the earlier transpose map, so `x.transpose(...).unsqueeze(...)` must still read the correct original coordinates. It must not reinterpret a noncontiguous intermediate as an unrelated contiguous storage buffer. The independent CUDA fixtures include this composition.

The primary API contracts are the versioned [PyTorch unsqueeze documentation](https://docs.pytorch.org/docs/2.9/generated/torch.unsqueeze.html) and [squeeze documentation](https://docs.pytorch.org/docs/2.9/generated/torch.squeeze.html). Direct page downloads returned HTTP403, so the ticket also archives the upstream v2.9.1 docstring source, installed docstrings, exact ATen schemas and121 independently executed source probes. The binder is independently implemented dimension arithmetic; no PyTorch implementation was copied into Kiln.

## 3. Preserve the ownership boundary

PyTorch singleton operations produce storage-sharing views. Kiln's current integration uses a value-semantic contract and conservative rules for functionalizing mutation. Supporting the correct values and shape of a view does not grant permission to mutate an aliased input.

The importer therefore does not add a view result to its set of values that own fresh storage. Even when a view's producer was fresh, the current analysis rejects an in-place operation through that view instead of assuming that no other observable alias exists. More precise alias analysis could eventually admit additional cases. That extension requires its own legality argument and tests.

This matters in a small example:

```python
fresh = x + 1
view = fresh.unsqueeze(0)
return torch.nn.functional.relu(view, inplace=True)
```

The new shape binder does not silently authorize the last operation. It preserves the existing rejection until ownership analysis can prove the transformation safe. This limits current coverage while protecting correctness. The milestone does not claim general storage-alias equivalence, arbitrary strided inputs or complete PyTorch view semantics.

The implementation also consolidates operand metadata lookup for matrix, normalization and singleton lowering in one helper. Source layout rules remain in the existing indexing module. Reusing that boundary avoids introducing a second reshape implementation or another parallel layout subsystem.

## 4. Separate translation, execution and complete tasks

A benchmark graph is one concrete program variant. A task groups related variants, potentially with different shapes or dtypes. Complete task acceptance requires every listed variant to pass. Individual accepted graphs from an incomplete task remain useful evidence, but they cannot be counted as a complete task.

All57 FX tests pass after adding source binding, malformed-call, ownership and FX/Dynamo matching cases. Equivalent public, method and ATen forms produce identical Kiln scripts. A test initially exhausted Dynamo's per-code compilation cache; resetting that cache between independent capture cases fixes test isolation without changing matcher predicates or compiler semantics.

The complete2060-graph import audit increases eligibility from1196 to1251 graphs and from69 to76 complete families, with zero regressions. Seven newly complete families contain55 variants. Their complete original membership is frozen before GPU qualification, without selecting favorable shapes or dtypes.

The independent CUDA fixtures cover four shape classes under FP32, FP16 and BF16: a scalar, a unit vector, interior singleton axes and a larger tail dimension. Each program returns six outputs, including insertion, removal, explicit axis selection and transpose composition. All12 programs compile and all72 finite output comparisons have zero error. This validates the supported primitive paths; it does not prove every composition in the corpus.

The full-family results are:

| Task index | Variants | Accepted at nominal t=-5 | Outcome |
|---|---:|---:|---|
| 10 | 33 | 0 | Export check stops the family; no original evaluation runs |
| 39 | 6 | 6 | Complete task accepted |
| 88 | 3 | 2 | One FP32 graph fails nominal numerical acceptance |
| 95 | 3 | 2 | One FP16 graph fails nominal numerical acceptance |
| 103 | 6 | 6 | Complete task accepted |
| 138 | 2 | 2 | Complete task accepted |
| 190 | 2 | 2 | Complete task accepted |
| Total | 55 | 20 | Four complete tasks, two evaluated rejections,33 unexecuted |

The four complete tasks contain16 graphs. Four more accepted graphs belong to the two incomplete tasks. Accordingly, the cumulative ledger advances from27 complete tasks/338 individual graphs to31/358, while graphs inside complete tasks increase from273 to289. The31 tasks are cumulative replay evidence across recorded compiler snapshots, not a uniform current-release rerun of all200 tasks.

## 5. Keep numerical failures in the result

Task10 first produces a successful artifact for one variant, then a FP16 S-ViPNAS-Res50 variant fails Kiln's end-to-end export check. The retained diagnostic is `end-to-end check FAILED`. Because the family stops during compilation, none of its33 variants proceeds through the original evaluator. The successful first artifact is not promoted to original-benchmark acceptance.

Tasks88 and95 reach original evaluation, each with exactly one replacement and successful process execution. One graph in each task nevertheless fails the nominal numerical criterion. The FP32 K-Net_fcn case passes at t=-3 but fails at-5 and-4; the FP16 case passes at-4 but fails at-5. Those looser points remain diagnostic information. They do not replace the declared t=-5 acceptance rule.

These observations separate a primitive's supported semantics from a complete computation's numerical behavior. The view fixtures are exact on their tested finite inputs, while the larger compositions still contain arithmetic and reduction behavior that needs investigation. This run does not establish the root cause of the three unresolved families. Predecessor operations, accumulation and rounding remain concrete follow-up subjects; no threshold is relaxed to convert a rejection into acceptance.

The verifier checks165 committed compiler/runtime source files against revision `a0400576e1eafd20ce018db903e6e0639a92ee62`. It checks the final remote source snapshot, frozen membership, generated script hashes,23 artifact identities from24 compilation attempts, and scorer/log hashes. Native fixture artifacts are also bound directly to the committed generated source files. An initial verifier assumption that fixture manifests contain a task-specific source-hash field was corrected by checking those actual committed bytes instead.

The compiler uses the declared A100 cost-model target for scheduling, and CUDA execution runs on the DGX Spark GB10. The launcher compiles for the detected device architecture. These hardware and scheduling identities are retained in the run plan; the milestone makes correctness and coverage claims rather than a paper-hardware performance comparison.

## 6. Read the original agent's actual outcome

The reference experiment runs the original PassAgent with the original PassBench source in a pinned image, using a declared local unquantized Qwen3-30B-A3B model. It is the shipped one-task/one-graph CrossViT operational smoke, not the official200-task/2060-graph evaluation.

The run finishes after50 steps and1086.22 seconds with `exit_reason=abs_step_limit`. The trajectory contains30 file editing actions, seven evaluator actions and13 responses without a function call. All seven evaluator calls explicitly reject matching and report the configured0.1 failure contribution. No generated implementation reaches a successful candidate correctness or timing result.

The original trajectory's reward field is misleading if read without its producer:

| Evidence | Observed value | Meaning |
|---|---|---|
| Original trajectory reward | 1.0 | Unconditional placeholder in the checked-out runtime |
| Original test output | Reward calculation not yet implemented | Confirms the reward stub |
| Audited evaluator score | 0.1 | Failure contribution from actual tool feedback |
| Original evaluator acceptance | None | All seven calls stop at matching |

The audit independently parses the tool's Score data JSON and checks it against the saved best score. Original agent and evaluator source are not modified. The serialized best snapshot contains an empty Triton convolution kernel. Because the agent only updates its best snapshot on a strictly higher score and all evaluations tie, this early snapshot remains selected. It is not evidence that every later edit was identical; it is evidence that the retained best implementation is invalid and no later candidate obtains a better evaluator result.

The model's native serving context is40960. The trajectory's131072 token-limit field is an agent-run budget, not a request-level generation limit: the original model_query does not pass max_tokens to LiteLLM. The largest recorded prompt is34415 tokens. This run therefore supplies no observed context-overflow explanation for the missing function calls.

## 7. Reproduce the matching discrepancy independently

The saved pattern expresses the same convolution and in-place ReLU as the source model. Ordinary symbolic tracing produces a functional ReLU call with `inplace=True` in kwargs. Dynamo captures the corresponding source call in that form. An ordinary subgraph matcher finds one match.

PassNet's actual replacement path uses `force_args_symbolic_trace`, which moves inspectable Python function arguments into positional form. For this ReLU, the resulting pattern becomes:

```text
pattern: relu(convolution, True)
target:  relu(convolution, inplace=True)
```

These calls describe the same source arguments, but the matcher compares different graph representations. The diagnostic reporting path uses ordinary symbolic tracing, which explains why it can find no specific node failure while actual replacement still finds no match.

The exact-image diagnostic confirms the effect on the DGX under Torch2.12.0a0+5aff3928d8.nv26.05. It tests CPU and CUDA, each with small and original task shapes. Every case produces the same counts:

| Pattern/target treatment | Matches |
|---|---:|
| Ordinary symbolic tracing and Dynamo | 1 |
| Original forced-argument pattern and Dynamo | 0 |
| Both diagnostic graphs normalized | 1 |

The last row is a diagnostic control, not a repair applied to the original agent run. It neither executes the empty candidate kernel nor changes the recorded rejection. The paper-version PyTorch2.9.1 matcher source is also archived. Static inspection shows its schema-based argument normalization is restricted to ATen OpOverload targets; this is not equivalent to running the paper's complete Dynamo/CUDA environment. Paper-version behavior remains a separate confirmation task.

The public checkout, local software stack and chosen checkpoint differ from the paper's experimental configuration. The observed discrepancy must be reported with those identities rather than used to claim that the published paper results are invalid or that the model alone caused every failure.

## 8. Keep the two experiments independent

The compiler qualification uses the existing declared Kiln integration protocol, including its source-argument normalization. The original agent run retains original PassNet behavior. Comparing their acceptance counts directly would conflate different populations, candidate quality and matching protocols. The Kiln replay uses 20 warmups and 100 trials; the original shipping entry uses 25 and 100. These configurations are retained rather than presented as an equalized performance comparison.

```mermaid
flowchart TD
    S[Original source graphs] --> K[Kiln source binder]
    K --> R[Existing reshape and compiler pipeline]
    R --> C[CUDA artifacts and PyTorch runtime]
    C --> I[Declared PassBench integration protocol]
    I --> A[Nominal acceptance and complete accounting]
    P[Original PassAgent] --> F[Generated Python pass]
    F --> O[Unchanged original replacement path]
    O --> X[Recorded no-match feedback]
    X --> T[Trajectory and independent audit]
```

The model server is stopped after terminal collection, before the new compiler qualification. The first fixture launch stops on a missing runtime module path; its log is preserved. A separate diagnosed launch supplies the documented path, reuses the already compiled artifacts, and passes the72-output native gate before running all55 corpus variants. No live workload is restarted because an observation times out, and no serving overlaps this qualification.

The remaining work follows the evidence. Resolve the export-check failure and two nominal numerical discrepancies while retaining all33 unexecuted variants. Verify paper-version matching and declare any repaired reference protocol separately. Broader original-agent evaluation and Kiln-native transformation synthesis remain open, as do full200-task support and uniform controlled release measurements. The previous fixed-compiler confirmation result remains an independent research experiment; this support milestone adds no new held-out speedup claim.

## Evidence and continuation

Source work is in `/home/manuel/code/wesen/kiln/worktrees/passnet`, branch `research/passnet`, ticket KILN-005. Design15 explains reshape legality and source singleton binding; design18 explains the local provider, terminal original-agent result and exact-runtime matching diagnosis. Reference21 stores this report, and diary Steps144 onward preserve the implementation and experiment sequence.

The authoritative new artifacts are `singleton-view-source-cohort-v1-verified-facts.json`, `singleton-view-source-cohort-v1-audit.json`, `singleton-view-native-fixtures-v1/`, `singleton-view-source-snapshot-v1.json`, and the cumulative `kiln-coverage.json`. The reference-agent audit is `original-agent-smoke-terminal-v1/verified-facts.json`, with complete trajectory/conversation, saved pass files and exact-runtime graph diagnostics alongside it. All are under the ticket's `sources/` directory.

The original tracer and reward behavior are inspectable in the pinned [custom replacement implementation](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/torch/custom_replacement.py) and [PassNet Docker runtime](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_agent/runtime/passnet_docker.py). No code from these algorithms is ported into the new singleton binder.

This report follows [[ARTICLE - Kiln - Original PassAgent Execution and Experimental Identity]] and [[ARTICLE - Kiln - Exact GELU and Complete Source Qualification]]. The full objective remains active;31 accepted tasks is a measured milestone within the200-task scope.
'''
body=body.replace(r'\[','$$').replace(r'\]','$$')
# Readability corrections keep numeric prose distinct from identifiers and hashes.
for old,new in {'all72':'all 72','and20':'and 20','reaches31/200':'reaches 31/200','and358/2060':'and 358/2060','reaches1251':'reaches 1251','and76':'and 76','Its50':'Its 50','of0.1':'of 0.1','reward1.0':'reward 1.0','and33':'and 33','axis1':'axis 1','axis0':'axis 0','or-1':'or -1','and121':'and 121','All57':'All 57','complete2060':'complete 2060','from1196':'from 1196','to1251':'to 1251','from69':'from 69','to76':'to 76','contain55':'contain 55','All12':'All 12','all72':'all 72','rejected at-5':'rejected at -5','rejected at-4':'rejected at -4','toleranceat-5':'tolerance at -5','rejected at-3':'rejected at -3','rejected,33':'rejected, 33','contain16':'contain 16','from27':'from 27','tasks/338':'tasks / 338','to31/358':'to 31/358','The31':'The 31','from273':'from 273','to289':'to 289','all200':'all 200','Task10':'Task 10','its33':'its 33','Tasks88':'Tasks 88','and95':'and 95','at-5':'at -5','and-4':'and -4','at-4':'at -4','checks165':'checks 165',',23':', 23','from24':'from 24','official200':'official 200','after50':'after 50','and1086':'and 1086','contains30':'contains 30','and13':'and 13','is40960':'is 40960',"trajectory's131072":"trajectory's 131072",'is34415':'is 34415','Torch2.12':'Torch 2.12','PyTorch2.9':'PyTorch 2.9','all55':'all 55','the72':'the 72','all33':'all 33','full200':'full 200','Design15':'Design 15','design18':'design 18','Reference21':'Reference 21','Steps144':'Steps 144',';31':'; 31','the200':'the 200','in1086':'in 1086'}.items():body=body.replace(old,new)
doc=next((p/'reference').glob('21-*.md'));front=doc.read_text().split('---',2)[1];doc.write_text('---'+front+'---\n\n'+body)
(s/'singleton-view-report-body.md').write_text(body);assert body.count('```')%2==0;print('Wrote',len(body.split()),'word report')
