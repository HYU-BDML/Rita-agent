# -*- coding: utf-8 -*-
"""Local bridge. Credentials stay in llmgw; stdin/stdout contain task data only."""
import json,sys
from llmgw import ask,list_models
request=json.load(sys.stdin)
provider='deepseek';model='deepseek-v4-pro'
if model not in list_models(provider):raise RuntimeError('Configured Cora model unavailable')
answer=ask(request['prompt'],provider=provider,model=model,system=request['system'],max_tokens=6000,temperature=0,cache=True,retries=1,tag='cora-mvp')
print(json.dumps({'text':answer,'provider':provider,'model':model,'cost':None},ensure_ascii=False))
