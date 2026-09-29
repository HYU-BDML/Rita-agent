import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import types
import unittest
from unittest.mock import patch

BRIDGE = Path(__file__).resolve().parents[1] / 'scripts/cora-llm.py'

class CoraCostPolicyTest(unittest.TestCase):
    def run_bridge(self, tier=None, available=True):
        calls = []
        def resolve(task):
            calls.append(('route', task))
            return 'deepseek', 'deepseek-flash' if task == 'cora_test' else 'deepseek-v4-pro'
        def ask(prompt, **kwargs):
            calls.append(('ask', kwargs))
            return 'test response'
        fake = types.SimpleNamespace(resolve=resolve, ask=ask,
            list_models=lambda _: ['deepseek-flash', 'deepseek-v4-pro'] if available else [])
        output = io.StringIO()
        with patch.dict('sys.modules', {'llmgw': fake}), patch.dict(os.environ, {}, clear=True):
            if tier is not None:
                os.environ['CORA_LLM_TIER'] = tier
            with patch('sys.stdin', io.StringIO('{"prompt":"test","system":"test"}')), contextlib.redirect_stdout(output):
                runpy.run_path(str(BRIDGE), run_name='__main__')
        return json.loads(output.getvalue()), calls

    def test_default_uses_test_route_without_retries(self):
        result, calls = self.run_bridge()
        self.assertEqual(result['model'], 'deepseek-flash')
        self.assertEqual(calls[0], ('route', 'cora_test'))
        self.assertEqual(calls[1][1]['retries'], 0)
        self.assertTrue(calls[1][1]['cache'])

    def test_quality_is_explicit(self):
        result, calls = self.run_bridge('quality')
        self.assertEqual(result['tier'], 'quality')
        self.assertEqual(calls[0], ('route', 'cora_quality'))

    def test_bad_tier_and_unavailable_model_fail_closed(self):
        with self.assertRaises(ValueError):
            self.run_bridge('automatic-upgrade')
        with self.assertRaises(RuntimeError):
            self.run_bridge(available=False)

if __name__ == '__main__':
    unittest.main()
