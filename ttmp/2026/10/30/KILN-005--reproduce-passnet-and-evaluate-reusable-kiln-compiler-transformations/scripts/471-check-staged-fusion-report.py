"""Check the report's central numerical claims against committed experiment data."""
import json
import math
from pathlib import Path
T=Path(__file__).resolve().parent.parent
read=lambda name:json.loads((T/'sources'/name).read_text())
fresh=read('staged-confirmation-results-v1/summary.json')
assert fresh['graphs']==13 and sum(not r['alias'] for r in fresh['records'])==2
assert math.isclose(fresh['family_balanced_speedup'],1.146076,abs_tol=0.0000005)
ranking=read('pi-transformation-results-v1/selection.json')['ranking']
assert len(ranking)==18 and all(r['eligible'] for r in ranking)
scores={r['policy']:r['family_balanced_speedup'] for r in ranking}
assert math.isclose(scores['sequence-5'],1.405801,abs_tol=0.0000005)
assert math.isclose(scores['staged-fusion'],1.405437,abs_tol=0.0000005)
assert sum(name.startswith('sequence-') and score==scores['staged-fusion'] for name,score in scores.items())==5
assert sum(name.startswith('sequence-') and score==1 for name,score in scores.items())==4
lanes=read('pi-transformation-lanes-v1/analysis.json')
accepted={level:sum(o['status']=='accepted' for lane in lanes if lane['requested_thinking']==level for o in lane['outcomes']) for level in ['low','medium','high']}
assert accepted=={'low':5,'medium':4,'high':6}
compilation=read('pi-transformation-artifacts-v1/study-compile-receipt.json')
assert compilation['status']=='qualified' and len(compilation['records'])==18
for row in compilation['records']:
 receipt=read('pi-transformation-artifacts-v1/'+row['policy']+'/compile-receipt.json')
 assert len(receipt['records'])==20 and all(r['status']=='compiled' for r in receipt['records'])
coverage=read('kiln-coverage.json')
assert (coverage['tasks_verified'],coverage['graphs_verified'],coverage['graphs_in_complete_tasks'])==(31,358,289)
report=T/'reference/26-staged-fusion-generalization-and-agent-composition.md'
body=report.read_text();assert body.count('```')%2==0 and '```mermaid' in body
print(json.dumps({'status':'passed','report_words':len(body.split()),'accepted_by_requested_thinking':accepted,'nominal_relative_gain_percent':100*(scores['sequence-5']/scores['staged-fusion']-1)},indent=2))
