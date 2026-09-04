/* ======== 共享 CORS 头 ======== */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ======== 供应商统一调用 ======== */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResult {
  ok: boolean;
  content: string;
  error?: string;
  provider?: string;
}

/* 调用 DeepSeek API */
export async function callDeepSeek(messages: LLMMessage[], apiKey: string): Promise<LLMResult> {
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, content: '', error: `DeepSeek HTTP ${resp.status}: ${errText.substring(0, 200)}` };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { ok: true, content, provider: 'deepseek' };
  } catch (e) {
    return { ok: false, content: '', error: `DeepSeek 请求异常: ${(e as Error).message}` };
  }
}

/* 调用通义千问 API */
export async function callQwen(messages: LLMMessage[], apiKey: string): Promise<LLMResult> {
  try {
    const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: messages,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, content: '', error: `Qwen HTTP ${resp.status}: ${errText.substring(0, 200)}` };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { ok: true, content, provider: 'qwen' };
  } catch (e) {
    return { ok: false, content: '', error: `Qwen 请求异常: ${(e as Error).message}` };
  }
}

/* 主供应商优先，失败自动回退到备用 */
export async function callLLM(messages: LLMMessage[]): Promise<LLMResult> {
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
  const qwenKey = Deno.env.get('QWEN_API_KEY');

  /* 优先 DeepSeek（已充值），回退 Qwen（有免费额度） */
  if (deepseekKey) {
    const result = await callDeepSeek(messages, deepseekKey);
    if (result.ok) return result;
    console.warn(`[LLM] DeepSeek 失败，尝试 Qwen: ${result.error}`);
  }
  if (qwenKey) {
    const result = await callQwen(messages, qwenKey);
    if (result.ok) return result;
    console.warn(`[LLM] Qwen 也失败: ${result.error}`);
  }
  return { ok: false, content: '', error: '所有供应商均不可用，请检查 API Key 配置' };
}
