/* ========================================================================
 * Edge Function: parse-client
 * 功能：接收客户资料 OCR 文本，调用大模型解析，返回结构化客户字段 JSON
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: {...clientFields}, error?: string }
 * ======================================================================== */
import { corsHeaders, callLLM, type LLMMessage } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  /* CORS 预检 */
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const text = body?.text;

    if (!text || text.trim().length < 10) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'OCR 文本过短或为空，请确保图片清晰后重试',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `你是一位专业的客户信息提取专家。用户会提供客户资料照片（如身份证、被保人信息页、客户信息表、投保单、名片等）经 OCR 提取的文字内容，请从中提取结构化的客户信息，以 JSON 格式返回。

【重要说明】
- 图片可能是保险公司 APP 的被保人信息页，字段名如"姓名、性别、电话、证件号码、出生日期、地址"等
- 可能是多张截图合并的文本，请综合所有信息
- OCR 可能有识别错误，请根据上下文智能修正（如数字 O→0，l→1，身份证号末位 X 保留大写等）

【提取规则】
1. 无法识别的字段填空字符串 ""，不要猜测
2. 身份证号统一 18 位格式，有 OCR 错误时尝试修正
3. 手机号统一 11 位纯数字
4. 性别填"男"或"女"
5. 返回纯 JSON，不要包含 markdown 标记

【字段映射参考】
- "姓名" → name
- "性别" → gender
- "电话/手机号" → phone
- "证件号码/身份证" → idCard
- "出生日期/生日" → birthday
- "地址/住址" → address
- "工作单位/公司" → workCompany
- "工作地址" → workAddress
- "客户号" → 放入 note

【JSON 字段说明】
{
  "name": "客户姓名",
  "idCard": "身份证号（18位）",
  "phone": "手机号（11位数字）",
  "gender": "性别（男/女）",
  "birthday": "出生日期（YYYY-MM-DD）",
  "address": "联系地址/住址",
  "workCompany": "工作单位/公司名称",
  "workAddress": "工作地址",
  "familyMembers": [
    {
      "name": "家庭成员姓名",
      "relationship": "与投保人关系（如：配偶/儿子/女儿/父亲/母亲等）",
      "idCard": "家庭成员身份证号",
      "phone": "家庭成员手机号",
      "gender": "性别（男/女）",
      "birthday": "出生日期（YYYY-MM-DD）",
      "note": "备注信息"
    }
  ],
  "note": "其他重要信息备注（不超过200字）"
}

注意：
- familyMembers 是数组，如果能识别到家庭成员信息请逐个提取
- 不要把投保人/被保人自己的信息放入 familyMembers
- 如果照片只是单个被保人信息页，familyMembers 为空数组 []`;

    const userPrompt = `请从以下 OCR 文本中提取客户结构化信息：

---

${text}

---

请返回 JSON 格式的提取结果。只返回你能从文本中识别到的字段，无法识别的填空字符串。`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await callLLM(messages);

    if (!result.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: result.error || '大模型调用失败',
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* 解析返回的 JSON */
    let parsed;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return new Response(JSON.stringify({
            ok: false,
            error: '模型返回内容无法解析为 JSON',
            raw: result.content.substring(0, 500),
          }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({
          ok: false,
          error: '模型返回内容无法解析为 JSON',
          raw: result.content.substring(0, 500),
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      data: parsed,
      provider: result.provider,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: `服务器异常: ${(e as Error).message}`,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
