# Uniform qualification of currently importable PassBench tasks

## Population

The current-source import census finds 111 fully importable evaluation task families containing 1,514 graphs. This study freezes exactly those families and every member of each `graph_list.txt`. It partitions execution into three scheduling bands: 56 previously unverified ordinary-size tasks / 561 graphs, two previously unverified large tasks / 522 graphs, and 53 previously verified tasks / 431 graphs. The prior 53-task ledger is cumulative across compiler revisions; this run is designed to replace that historical view with one uniform current-source measurement. The band split changes scheduling, not the evaluation denominator.

Scripts623–625 preserve the current import census and coverage ledger hashes in all plans, stage one compiler source snapshot, and run the bands in sequence on bling. Independent task compilation can later be parallelized, but timed GPU evaluation remains serialized. The plans use the pinned image, NVIDIA GB10, target A100 cost model, separate contraction, 20 warmups, 100 trials, the declared FX normalization integration, and original PassBench numerical and scoring code. The Kiln internal synthetic reference check is explicitly bypassed for this exploratory uniform pass; the external `t=-5` numerical check remains the acceptance authority. Report this as modified integration, not untouched PassNet reproduction.

## Expected evidence

For every task, retain the exact source program, compiled artifact or compiler error, generated pass, matcher/evaluator log, numerical curve, scorer result and run manifest. The audit must count import, compile, match, execution, nominal correctness and score separately. A task contributes to complete-task acceptance only when every graph in its frozen list passes. Missing or timed-out members stay in the denominator. A baseline task previously accepted under an older snapshot is a regression if the current uniform run fails it, regardless of historical coverage.

The immediate purpose is to locate *shared* blockers among the 58 unverified but importable families and establish a current-source coverage baseline. Fine-grained investigations follow only when they affect multiple families or a compiler invariant. The optimization portfolio in reference34 uses only task families whose current uniform execution is numerically accepted.
