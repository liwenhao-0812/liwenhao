/* ========================================================================
   保单管理系统 - 09：AI 辅助功能（条款解读 + 保单照片OCR）
   依赖：pdf.js（CDN）、Tesseract.js（CDN）
   架构：浏览器本地提取文本 → Supabase Edge Function 代理 → DeepSeek/通义千问 API
   隐私：条款（公开文件）直接发大模型；保单照片本地 OCR，仅文本经大模型解析
   ======================================================================== */

/* ======== Edge Function URL ======== */
var EF_INTERPRET_CLAUSE = SUPABASE_URL + '/functions/v1/interpret-clause';
var EF_PARSE_POLICY = SUPABASE_URL + '/functions/v1/parse-policy';

/* ======== 加载动态依赖（pdf.js / Tesseract.js）======== */
var _pdfjsLoaded = false;
var _tesseractLoaded = false;

function loadPdfJS() {
  if (_pdfjsLoaded || typeof pdfjsLib !== 'undefined') {
    _pdfjsLoaded = true;
    return Promise.resolve();
  }
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = function() {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        _pdfjsLoaded = true;
        resolve();
      } else {
        reject(new Error('pdf.js 加载失败'));
      }
    };
    s.onerror = function() { reject(new Error('pdf.js CDN 加载失败')); };
    document.head.appendChild(s);
  });
}

function loadTesseract() {
  if (_tesseractLoaded || typeof Tesseract !== 'undefined') {
    _tesseractLoaded = true;
    return Promise.resolve();
  }
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function() {
      if (typeof Tesseract !== 'undefined') {
        _tesseractLoaded = true;
        resolve();
      } else {
        reject(new Error('Tesseract.js 加载失败'));
      }
    };
    s.onerror = function() { reject(new Error('Tesseract.js CDN 加载失败')); };
    document.head.appendChild(s);
  });
}

/* ======== PDF 文本提取（浏览器本地，不传服务器）======== */
async function extractPdfText(file) {
  await loadPdfJS();
  var arrayBuffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  var fullText = '';
  var maxPages = Math.min(pdf.numPages, 30); /* 最多读取30页 */
  for (var i = 1; i <= maxPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    var pageText = content.items.map(function(item) { return item.str; }).join(' ');
    fullText += pageText + '\n\n--- 第' + i + '页 ---\n\n';
  }
  return fullText;
}

/* ======== 图片 OCR 提取（浏览器本地，图片不离开浏览器）======== */
async function extractImageOcr(file, onProgress) {
  await loadTesseract();
  var imageData = await fileToImageData(file);

  var result = await Tesseract.recognize(
    imageData,
    'chi_sim+eng',
    {
      logger: function(m) {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      }
    }
  );
  return result.data.text || '';
}

/* 图片预处理：转灰度 + 对比度增强，提升 OCR 精度 */
async function fileToImageData(file) {
  var img = await fileToImage(file);

  var canvas = document.createElement('canvas');
  var maxW = 2000;
  var scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  /* 灰度化 + 对比度增强 */
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var data = imageData.data;
  var contrast = 1.5; /* 对比度因子 */
  var intercept = 128 * (1 - contrast);
  for (var i = 0; i < data.length; i += 4) {
    var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray = gray * contrast + intercept;
    gray = Math.max(0, Math.min(255, gray));
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function fileToImage(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('图片加载失败')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('文件读取失败')); };
    reader.readAsDataURL(file);
  });
}

/* ======== 调用 Edge Function: 条款解读 ======== */
async function aiInterpretClause(text, insuranceName) {
  var resp = await fetch(EF_INTERPRET_CLAUSE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + currentSessionToken,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text: text, insuranceName: insuranceName || '' }),
  });
  var json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || '条款解读失败 (HTTP ' + resp.status + ')');
  }
  return json.data;
}

/* ======== 调用 Edge Function: 保单解析 ======== */
async function aiParsePolicy(ocrText) {
  var resp = await fetch(EF_PARSE_POLICY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + currentSessionToken,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text: ocrText }),
  });
  var json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.error || '保单解析失败 (HTTP ' + resp.status + ')');
  }
  return json.data;
}

/* ======== UI: 条款上传与解读 ======== */

/* 打开条款上传模态框 */
function openClauseUploadModal(idx) {
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;
  var item = lib[idx];

  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'clauseUploadModal';
  modal.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px;max-width:560px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h3 style="margin:0;font-size:18px;color:#1e293b;">📄 上传条款 - ${item.insuranceName || ''}</h3>
        <button onclick="document.getElementById('clauseUploadModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#64748b;">&times;</button>
      </div>

      <div style="margin-bottom:16px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0c4a6e;line-height:1.6;">
        支持 PDF / 图片（JPG/PNG）格式条款文件。<br>
        条款文本将在浏览器本地提取，然后发送给大模型解读结构化特征。<br>
        <strong>条款是公开文件，发送给大模型无隐私风险。</strong>
      </div>

      <div id="clauseDropZone" style="border:2px dashed #cbd5e1;border-radius:10px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s;background:#f8fafc;">
        <div style="font-size:36px;margin-bottom:8px;">📄</div>
        <div style="color:#64748b;font-size:14px;">点击选择文件 或 拖拽条款文件到此</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px;">支持 PDF / JPG / PNG，最大 20MB</div>
        <input type="file" id="clauseFileInput" accept=".pdf,.jpg,.jpeg,.png" style="display:none;">
      </div>

      <div id="clauseProgress" style="display:none;margin-top:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="spinner" style="width:18px;height:18px;border:2px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span id="clauseProgressText" style="font-size:13px;color:#475569;">正在处理...</span>
        </div>
        <div style="margin-top:8px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
          <div id="clauseProgressBar" style="height:100%;background:#3b82f6;width:0%;transition:width 0.3s;"></div>
        </div>
      </div>

      <div id="clauseResult" style="display:none;margin-top:16px;"></div>

      <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('clauseUploadModal').remove()" style="padding:8px 20px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#475569;">取消</button>
        <button id="clauseApplyBtn" style="display:none;padding:8px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;" onclick="applyClauseResult(${idx})">应用解读结果</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  /* 绑定文件选择 */
  var fileInput = modal.querySelector('#clauseFileInput');
  var dropZone = modal.querySelector('#clauseDropZone');
  dropZone.addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function() {
    if (fileInput.files[0]) handleClauseFile(fileInput.files[0], idx, item.insuranceName);
  });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; });
  dropZone.addEventListener('dragleave', function() { dropZone.style.borderColor = '#cbd5e1'; });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    if (e.dataTransfer.files[0]) handleClauseFile(e.dataTransfer.files[0], idx, item.insuranceName);
  });
}

/* 处理条款文件 */
async function handleClauseFile(file, idx, insuranceName) {
  var progressDiv = document.getElementById('clauseProgress');
  var progressText = document.getElementById('clauseProgressText');
  var progressBar = document.getElementById('clauseProgressBar');
  var resultDiv = document.getElementById('clauseResult');
  var applyBtn = document.getElementById('clauseApplyBtn');

  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  applyBtn.style.display = 'none';

  try {
    /* 步骤1：提取文本 */
    var text = '';
    var fileName = file.name.toLowerCase();
    if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      progressText.textContent = '正在提取 PDF 文本...';
      progressBar.style.width = '30%';
      text = await extractPdfText(file);
    } else if (fileName.match(/\.(jpg|jpeg|png)$/) || file.type.startsWith('image/')) {
      progressText.textContent = '正在提取图片文字 (OCR)...';
      progressBar.style.width = '30%';
      text = await extractImageOcr(file, function(pct) {
        progressBar.style.width = (30 + pct * 0.3) + '%';
      });
    } else {
      throw new Error('不支持的文件格式，请上传 PDF 或图片文件');
    }

    if (!text || text.trim().length < 50) {
      throw new Error('提取的文本过短，请确保文件内容清晰完整');
    }

    /* 步骤2：调用大模型解读 */
    progressText.textContent = '大模型正在解读条款...';
    progressBar.style.width = '70%';
    var traits = await aiInterpretClause(text, insuranceName);

    progressBar.style.width = '100%';
    progressText.textContent = '解读完成！';
    window._clauseResult = traits;

    /* 步骤3：展示结果 */
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = buildClauseResultHtml(traits);
    applyBtn.style.display = 'block';

    setTimeout(function() { progressDiv.style.display = 'none'; }, 1000);
  } catch (e) {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;">❌ ' + (e.message || '处理失败') + '</div>';
  }
}

/* 构建解读结果展示 HTML */
function buildClauseResultHtml(traits) {
  var rows = [
    ['险种类别', traits.category || '未识别'],
    ['等待期', traits.waitingPeriod !== '' && traits.waitingPeriod != null ? (traits.waitingPeriod === '0' ? '无等待期' : traits.waitingPeriod + ' 天') : '未识别'],
    ['生存金起领', formatAnnuityStart(traits.annuityStart, traits.annuityStartVal)],
    ['领取频率', formatFreq(traits.annuityFreq)],
    ['分红金起领', formatDividendStart(traits.dividendStart, traits.dividendStartVal)],
    ['分红频率', formatFreq(traits.dividendFreq)],
    ['备注', traits.note || '无'],
  ];

  var html = '<div style="padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">';
  html += '<div style="font-weight:600;color:#15803d;margin-bottom:10px;font-size:14px;">✅ 大模型解读结果</div>';
  html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
  rows.forEach(function(r) {
    html += '<tr><td style="padding:4px 8px;color:#64748b;width:100px;border-bottom:1px solid #f1f5f9;">' + r[0] + '</td><td style="padding:4px 8px;color:#1e293b;border-bottom:1px solid #f1f5f9;">' + r[1] + '</td></tr>';
  });
  html += '</table>';
  html += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;">点击「应用解读结果」将自动填充到险种特征中，可再手动校对</div>';
  html += '</div>';
  return html;
}

function formatAnnuityStart(start, val) {
  if (!start || start === 'none') return '无领取责任';
  if (start === 'afterYears') return '投保后 ' + (val || 'N') + ' 起领';
  if (start === 'atAge') return (val || 'N') + ' 起领';
  if (start === 'fixedDate') return '按 ' + (val || '指定期限') + ' 起领';
  return '未识别';
}
function formatDividendStart(start, val) {
  if (!start || start === 'none') return '无分红';
  if (start === 'nextYear') return '次年起领';
  if (start === 'afterYears') return '投保后 ' + (val || 'N') + ' 起领';
  if (start === 'fixedDate') return '按 ' + (val || '指定期限') + ' 起领';
  return '未识别';
}
function formatFreq(freq) {
  var map = { annual: '每年', triennial: '每三年', monthly: '每月', lumpsum: '一次性', none: '无' };
  return map[freq] || '未识别';
}

/* 应用解读结果到险种库 */
function applyClauseResult(idx) {
  var traits = window._clauseResult;
  if (!traits) return;
  var lib = getInsuranceTypeLib();
  if (idx < 0 || idx >= lib.length) return;

  lib[idx].traits = Object.assign({}, lib[idx].traits || {}, {
    category: traits.category || lib[idx].traits?.category || '',
    waitingPeriod: traits.waitingPeriod !== '' && traits.waitingPeriod != null ? traits.waitingPeriod : (lib[idx].traits?.waitingPeriod || ''),
    annuityStart: traits.annuityStart || lib[idx].traits?.annuityStart || '',
    annuityStartVal: traits.annuityStartVal || lib[idx].traits?.annuityStartVal || '',
    annuityFreq: traits.annuityFreq || lib[idx].traits?.annuityFreq || '',
    dividendStart: traits.dividendStart || lib[idx].traits?.dividendStart || '',
    dividendStartVal: traits.dividendStartVal || lib[idx].traits?.dividendStartVal || '',
    dividendFreq: traits.dividendFreq || lib[idx].traits?.dividendFreq || '',
    note: traits.note || lib[idx].traits?.note || '',
  });

  saveInsuranceTypeLib(lib);
  renderInsuranceTypeLib();
  var modal = document.getElementById('clauseUploadModal');
  if (modal) modal.remove();
  showToast('✅ 条款解读结果已应用到「' + (lib[idx].insuranceName || '') + '」', 'success');
}

/* ======== UI: 保单照片 OCR 识别 ======== */

/* 打开保单照片识别模态框 */
function openPolicyOcrModal(editIdx) {
  var isEdit = editIdx >= 0;

  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'policyOcrModal';
  modal.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px;max-width:560px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h3 style="margin:0;font-size:18px;color:#1e293b;">📷 保单照片识别</h3>
        <button onclick="document.getElementById('policyOcrModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#64748b;">&times;</button>
      </div>

      <div style="margin-bottom:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;line-height:1.6;">
        <strong>隐私保护说明：</strong>照片在浏览器本地 OCR 提取文字，<strong>图片不会上传</strong>。
        提取的文字经大模型解析为结构化字段，识别结果会预填到表单中供您校对。
      </div>

      <div id="ocrDropZone" style="border:2px dashed #cbd5e1;border-radius:10px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s;background:#f8fafc;">
        <div style="font-size:36px;margin-bottom:8px;">📷</div>
        <div style="color:#64748b;font-size:14px;">点击选择保单照片 或 拖拽到此</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px;">支持 JPG / PNG，APP 截图也可，最大 20MB</div>
        <input type="file" id="ocrFileInput" accept=".jpg,.jpeg,.png" style="display:none;">
      </div>

      <div id="ocrProgress" style="display:none;margin-top:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="spinner" style="width:18px;height:18px;border:2px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span id="ocrProgressText" style="font-size:13px;color:#475569;">正在处理...</span>
        </div>
        <div style="margin-top:8px;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
          <div id="ocrProgressBar" style="height:100%;background:#3b82f6;width:0%;transition:width 0.3s;"></div>
        </div>
      </div>

      <div id="ocrRawText" style="display:none;margin-top:16px;max-height:150px;overflow-y:auto;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#64748b;font-family:monospace;white-space:pre-wrap;"></div>

      <div id="ocrResult" style="display:none;margin-top:16px;"></div>

      <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="document.getElementById('policyOcrModal').remove()" style="padding:8px 20px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#475569;">取消</button>
        <button id="ocrApplyBtn" style="display:none;padding:8px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;" onclick="applyOcrResult(${isEdit ? editIdx : -1})">填充到表单</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  var fileInput = modal.querySelector('#ocrFileInput');
  var dropZone = modal.querySelector('#ocrDropZone');
  dropZone.addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function() {
    if (fileInput.files[0]) handlePolicyOcrFile(fileInput.files[0], isEdit ? editIdx : -1);
  });
  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.style.borderColor = '#3b82f6'; });
  dropZone.addEventListener('dragleave', function() { dropZone.style.borderColor = '#cbd5e1'; });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    if (e.dataTransfer.files[0]) handlePolicyOcrFile(e.dataTransfer.files[0], isEdit ? editIdx : -1);
  });
}

/* 处理保单照片 */
async function handlePolicyOcrFile(file, editIdx) {
  var progressDiv = document.getElementById('ocrProgress');
  var progressText = document.getElementById('ocrProgressText');
  var progressBar = document.getElementById('ocrProgressBar');
  var resultDiv = document.getElementById('ocrResult');
  var applyBtn = document.getElementById('ocrApplyBtn');
  var rawTextDiv = document.getElementById('ocrRawText');

  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  applyBtn.style.display = 'none';
  rawTextDiv.style.display = 'none';

  try {
    /* 步骤1：本地 OCR 提取文字 */
    progressText.textContent = '正在本地 OCR 提取文字...';
    progressBar.style.width = '10%';
    var ocrText = await extractImageOcr(file, function(pct) {
      progressBar.style.width = (10 + pct * 0.6) + '%';
      progressText.textContent = 'OCR 识别中... ' + pct + '%';
    });

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error('OCR 未识别到足够文字，请确保照片清晰、光线充足后重试');
    }

    /* 展示原始 OCR 文本 */
    rawTextDiv.style.display = 'block';
    rawTextDiv.textContent = ocrText.substring(0, 1000) + (ocrText.length > 1000 ? '\n...' : '');

    /* 步骤2：调用大模型解析 */
    progressText.textContent = '大模型正在解析保单信息...';
    progressBar.style.width = '80%';
    var policyData = await aiParsePolicy(ocrText);

    progressBar.style.width = '100%';
    progressText.textContent = '解析完成！';
    window._ocrResult = policyData;

    /* 步骤3：展示结果 */
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = buildOcrResultHtml(policyData);
    applyBtn.style.display = 'block';

    setTimeout(function() { progressDiv.style.display = 'none'; }, 1000);
  } catch (e) {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;">❌ ' + (e.message || '处理失败') + '</div>';
  }
}

/* 构建识别结果展示 HTML */
function buildOcrResultHtml(data) {
  var fieldLabels = {
    name: '投保人姓名', idCard: '身份证号', phone: '手机号', address: '地址',
    policyCode: '保单号', insuranceName: '险种名称', codeType: '险种代码',
    insuranceCompany: '保险公司', annualPremium: '年保费', sumInsured: '保额',
    startDate: '生效日期', maturityDate: '满期日期', hasDividend: '是否有分红',
    status: '保单状态', paymentMethod: '缴费方式', paymentYears: '缴费年限',
    insuredName: '被保险人', insuredRelation: '与投保人关系', insuredIdCard: '被保人身份证',
    insuredPhone: '被保人电话', beneficiary: '受益人',
    survivalType: '生存金类型', survivalAmount: '生存金金额', survivalStartDate: '起领日期',
    note: '备注'
  };

  var statusMap = { active: '有效', lapsed: '失效', surrendered: '已退保', matured: '已满期', unknown: '未知' };
  var payMethodMap = { annual: '年缴', monthly: '月缴', quarterly: '季缴', semiannual: '半年缴', single: '趸交', unknown: '未知' };
  var survTypeMap = { annual: '每年', triennial: '每三年', maturity: '满期一次性', none: '无' };

  var html = '<div style="padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">';
  html += '<div style="font-weight:600;color:#15803d;margin-bottom:10px;font-size:14px;">✅ 识别结果（请校对后填充到表单）</div>';
  html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';

  Object.keys(fieldLabels).forEach(function(key) {
    var val = data[key];
    if (val === undefined || val === null || val === '') return;
    var display = val;
    if (key === 'hasDividend') display = val === true || val === 'true' ? '是' : '否';
    if (key === 'status') display = statusMap[val] || val;
    if (key === 'paymentMethod') display = payMethodMap[val] || val;
    if (key === 'survivalType') display = survTypeMap[val] || val;

    html += '<tr><td style="padding:4px 8px;color:#64748b;width:100px;border-bottom:1px solid #f1f5f9;">' + fieldLabels[key] + '</td>';
    html += '<td style="padding:4px 8px;color:#1e293b;border-bottom:1px solid #f1f5f9;">' + display + '</td></tr>';
  });

  html += '</table>';
  html += '<div style="margin-top:10px;font-size:11px;color:#94a3b8;">点击「填充到表单」后可逐字段校对修改</div>';
  html += '</div>';
  return html;
}

/* 应用 OCR 结果到保单表单 */
function applyOcrResult(editIdx) {
  var data = window._ocrResult;
  if (!data) return;

  /* 保单模态框已经打开（OCR 按钮在保单表单内），直接填充字段即可 */
  /* 逐字段填充，空值跳过 */
  var fieldMap = {
    'policyCode': data.policyCode,
    'insuranceName': data.insuranceName,
    'codeType': data.codeType,
    'annualPremium': data.annualPremium,
    'sumInsured': data.sumInsured,
    'startDate': data.startDate,
    'maturityDate': data.maturityDate,
    'paymentMethod': data.paymentMethod,
    'paymentTerm': data.paymentYears,
    'insuredName': data.insuredName,
    'insuredRelation': data.insuredRelation,
    'insuredId': data.insuredIdCard,
    'insuredPhone': data.insuredPhone,
    'survivalBenefitType': data.survivalType,
    'survivalBenefitAmount': data.survivalAmount,
    'survivalStartDate': data.survivalStartDate,
    'policyRemark': data.note,
  };

  /* 分红复选框 */
  if (data.hasDividend !== undefined && data.hasDividend !== '') {
    var divCb = document.getElementById('hasDividend');
    if (divCb) divCb.checked = (data.hasDividend === true || data.hasDividend === 'true');
  }

  /* 保单状态下拉 */
  if (data.status) {
    var statusSelect = document.getElementById('policyStatus');
    if (statusSelect) statusSelect.value = data.status;
  }

  Object.keys(fieldMap).forEach(function(fieldId) {
    var val = fieldMap[fieldId];
    if (val === undefined || val === null || val === '') return;
    var el = document.getElementById(fieldId);
    if (el) el.value = val;
  });

  /* 触发险种特征提示 */
  var insName = data.insuranceName || '';
  var codeType = data.codeType || '';
  if (insName || codeType) {
    var libItem = findLibItem(insName, codeType);
    if (libItem) showPolicyTraitHint(libItem);
  }

  var modal = document.getElementById('policyOcrModal');
  if (modal) modal.remove();
  showToast('✅ 识别结果已填充到表单，请校对后保存', 'success');
}

/* ======== AI 功能连接测试 ======== */
async function testAiFunctions() {
  var statusText = document.getElementById('aiFuncStatusText');
  if (!statusText) return;
  statusText.textContent = '正在测试连接...';
  statusText.style.color = '#d97706';

  try {
    /* 用一段简短测试文本调用条款解读 */
    var resp = await fetch(EF_INTERPRET_CLAUSE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentSessionToken,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ text: '这是一段测试文本，用于验证Edge Function和大模型API连通性。本产品为终身寿险，等待期90天。', insuranceName: '测试险种' }),
    });

    if (!resp.ok) {
      var errBody = await resp.text();
      statusText.textContent = '连接失败 (HTTP ' + resp.status + '): ' + errBody.substring(0, 100);
      statusText.style.color = '#dc2626';
      return;
    }

    var json = await resp.json();
    if (json.ok) {
      var provider = json.provider || '未知';
      var cat = json.data?.category || '';
      statusText.innerHTML = '✅ 连接正常（供应商: ' + provider + '）' + (cat ? ' | 测试解读: ' + cat : '');
      statusText.style.color = '#15803d';
      showToast('AI 功能连接测试通过', 'success');
    } else {
      statusText.textContent = '❌ ' + (json.error || '返回异常');
      statusText.style.color = '#dc2626';
    }
  } catch (e) {
    statusText.textContent = '❌ 连接异常: ' + (e.message || e);
    statusText.style.color = '#dc2626';
  }
}

/* 页面加载时自动检查 AI 功能状态 */
function initAiFuncStatus() {
  var statusText = document.getElementById('aiFuncStatusText');
  if (!statusText) return;
  if (!currentSessionToken) {
    statusText.textContent = '请登录后使用 AI 功能';
    statusText.style.color = '#94a3b8';
    return;
  }
  statusText.textContent = 'Edge Function 就绪，点击「测试连接」验证';
  statusText.style.color = '#64748b';
}
