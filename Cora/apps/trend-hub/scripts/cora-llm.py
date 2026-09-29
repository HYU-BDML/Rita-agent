# -*- coding: utf-8 -*-
"""Local bridge. Credentials and model routing stay in llmgw."""
import json
import os
import sys
from llmgw import ask, list_models, resolve


def main():
    request = json.load(sys.stdin)
    tier = os.environ.get('CORA_LLM_TIER', 'test')
    if tier not in ('test', 'quality'):
        raise ValueError('CORA_LLM_TIER must be test or quality')
    # Dedicated routes preserve every other project's model settings.
    provider, model = resolve(task='cora_' + tier)
    if model not in list_models(provider):
        raise RuntimeError('Configured Cora model unavailable; no automatic upgrade')
    answer = ask(request['prompt'], provider=provider, model=model,
                 system=request['system'], max_tokens=6000, temperature=0,
                 cache=True, retries=0, tag='cora-' + tier)
    print(json.dumps({'text': answer, 'provider': provider, 'model': model,
                      'tier': tier, 'cost': None}, ensure_ascii=False))


if __name__ == '__main__':
    main()
