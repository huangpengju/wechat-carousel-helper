/**
 * content-script.js — 微信公众号轮播图采集助手
 *
 * 功能：图片采集、轮播代码生成、复制
 */

// ============================================================
// 存储层
// ============================================================
const STORAGE_KEY = 'collectedImages';

async function getImages() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || []);
    });
  });
}

async function saveImages(images) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: images }, resolve);
  });
}

async function addImage(url, name) {
  const images = await getImages();
  if (images.some((img) => img.url === url)) return false;
  images.push({ url, name, timestamp: Date.now() });
  await saveImages(images);
  return true;
}

async function removeImage(url) {
  const images = await getImages();
  await saveImages(images.filter((img) => img.url !== url));
}

async function clearImages() {
  await saveImages([]);
}

async function collectFromEditor() {
  const images = await getImages();
  const existingUrls = new Set(images.map((img) => img.url));
  const imgElements = document.querySelectorAll(
    '#ueditor_0 .ProseMirror img[data-src], #js_content img[data-src], .weixin-editor img[data-src], #edtorImgList img, .editor_img img, img[data-src]'
  );
  let added = false;
  imgElements.forEach((img) => {
    const url = img.dataset.src || img.src;
    if (url && url.startsWith('http') && !existingUrls.has(url)) {
      const name = url.split('/').pop() || `image_${Date.now()}`;
      images.push({ url, name, timestamp: Date.now() });
      existingUrls.add(url);
      added = true;
    }
  });
  if (added) await saveImages(images);
  return images;
}

// 单张图片采集（点击触发）
async function collectSingleImage(imgElement) {
  const url = imgElement.dataset.src || imgElement.src;
  if (!url || !url.startsWith('http')) return;
  const existed = await addImage(url, url.split('/').pop() || `image_${Date.now()}`);
  if (existed) {
    showCopyTip('✅ 图片已采集');
    currentImages = await getImages();
    renderImageList();
    updateCarouselPreview();
  } else {
    showCopyTip('⚠️ 图片已在列表中');
  }
}

// ============================================================
// 轮播代码生成
// ============================================================
function generateCarouselHTML(images) {
  if (!images || images.length === 0) {
    return '<!-- 暂无图片，请先采集图片 -->';
  }

  const n = images.length;
  const percent = 100 / n;
  const maxPercent = n * 100;

  const imgsJson = images
    .map(() => {
      return `{"w":1440,"h":1863,"imgid":"${Math.floor(10000000 + Math.random() * 90000000)}","group":"202633605"}`;
    })
    .join(',');

  const dataJson = `%7B%22custom%22%3A%7B%22imgs%22%3A%5B${imgsJson}%5D%7D%2C%22id%22%3A%2213%22%7D`;

  const imgSections = images
    .map((img) => {
      return `                                <section style="vertical-align: top; display: inline-block; width:${percent.toFixed(2)}%; text-align: center;"><img
                                        style="visibility:visible !important;width:100% !important; height:auto !important;vertical-align:top;user-select:none;display:inline-block;"
                                        src="${img.url}" />
                                </section>`;
    })
    .join('\n');

  // 生成唯一 ID（用于关联可滚动区域）
  const uid = 'c' + Date.now();

  return `<section _editor copyright="huangpengju"
    style="background-repeat:repeat;background-position:left top;background-size:auto;text-align:center;">
    <section class="block" style="margin:0;padding:0;text-align:left;">
        <section class="block-inner">
            <section _editor>
                <section class="svg"
                    data-json="${dataJson}">
                    <section style="transform:scale(1);line-height:0;font-size:0;padding:0;margin:0;">
                        <section
                            style="overflow-x:overlay;overflow-y:hidden;-webkit-overflow-scrolling:touch;vertical-align:top;display:inline-block;width:100%;">
                            <section id="${uid}"
                                style="white-space:nowrap;overflow:hidden;max-width:${maxPercent}% !important;width:${maxPercent}%;line-height:0;font-size:0;">
${imgSections}
                            </section>
                        </section>
                        <section style="text-align:center;padding:8px 0 0;font-size:12px;color:#999;letter-spacing:2px;">
                            &lt;&lt;&lt; 左右滑动查看更多 &gt;&gt;&gt;
                        </section>
                    </section>
                </section>
            </section>
        </section>
    </section>
</section>`;
}

// ============================================================
// 剪贴板
// ============================================================
async function copyAsPlainText(html) {
  try {
    await navigator.clipboard.writeText(html);
    showCopyTip('纯文本已复制');
  } catch (err) {
    showCopyTip('复制失败，请重试');
  }
}

async function copyAsRichText(html) {
  try {
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:100%;z-index:-1';
    document.body.appendChild(container);
    const imgs = container.querySelectorAll('img');
    await Promise.all(
      Array.from(imgs).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = resolve;
              img.onerror = resolve;
            }
          })
      )
    );
    const blob = new Blob([html], { type: 'text/html' });
    const clipboardItem = new ClipboardItem({
      'text/html': blob,
      'text/plain': new Blob([html], { type: 'text/plain' })
    });
    await navigator.clipboard.write([clipboardItem]);
    showCopyTip('富文本已复制，直接粘贴到公众号编辑器');
    document.body.removeChild(container);
  } catch (err) {
    await copyAsPlainText(html);
    showCopyTip('富文本复制失败，已降级为纯文本');
  }
}

function showCopyTip(message) {
  const tip = document.createElement('div');
  tip.textContent = message;
  tip.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:999999;pointer-events:none;transition:opacity 0.3s;';
  document.body.appendChild(tip);
  setTimeout(() => {
    tip.style.opacity = '0';
    setTimeout(() => tip.remove(), 300);
  }, 2000);
}

// ============================================================
// 面板 UI
// ============================================================
let panel = null;
let currentImages = [];

function initPanel() {
  if (panel) return;
  getImages().then((imgs) => {
    currentImages = imgs;
    createPanel();
    renderImageList();
    updateCarouselPreview();
  });
}

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'img-collector-panel';
  panel.innerHTML = `
    <div class="panel-header" id="panelDragHandle" style="cursor:move;">
      <span class="panel-title">🖼 轮播图助手</span>
      <button class="panel-toggle-btn" id="panelToggleBtn" title="收起面板">−</button>
    </div>
    <div class="panel-body" id="panelBody">
      <button class="btn-primary" id="collectBtn">一键采集全部图片</button>

      <div class="image-list-header">
        <span class="image-list-title">图片列表 (<span id="imageCount">0</span>)</span>
      </div>
      <div class="image-list" id="imageList"></div>

      <div class="image-actions">
        <button class="btn-secondary" id="addUrlBtn">+ 添加链接</button>
        <button class="btn-danger" id="clearBtn">清空</button>
      </div>

      <div class="code-preview-header" id="codeToggle" style="cursor:pointer;user-select:none;">
        <span id="codeToggleIcon">▶</span> <span>轮播代码预览</span>
      </div>
      <div class="code-preview" id="codePreviewWrap" style="display:none;">
        <pre id="codePreview"></pre>
      </div>

      <div class="copy-actions">
        <button class="btn-primary" id="copyTextBtn">复制纯文本</button>
        <button class="btn-primary" id="copyRichBtn">复制富文本</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  bindPanelEvents();
}

function bindPanelEvents() {
  document.getElementById('collectBtn').addEventListener('click', async () => {
    currentImages = await collectFromEditor();
    renderImageList();
    updateCarouselPreview();
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('确定清空所有图片？')) {
      await clearImages();
      currentImages = [];
      renderImageList();
      updateCarouselPreview();
    }
  });

  document.getElementById('addUrlBtn').addEventListener('click', () => {
    const url = prompt('请输入图片链接：');
    if (url && url.startsWith('http')) {
      addImageByUrl(url);
    }
  });

  document.getElementById('copyTextBtn').addEventListener('click', () => {
    copyAsPlainText(document.getElementById('codePreview').textContent);
  });

  document.getElementById('copyRichBtn').addEventListener('click', () => {
    copyAsRichText(document.getElementById('codePreview').textContent);
  });

  // 面板折叠/展开
  let panelCollapsed = false;
  const toggleBtn = document.getElementById('panelToggleBtn');
  const panelBody = document.getElementById('panelBody');
  toggleBtn.addEventListener('click', () => {
    panelCollapsed = !panelCollapsed;
    panelBody.style.display = panelCollapsed ? 'none' : 'flex';
    toggleBtn.textContent = panelCollapsed ? '+' : '−';
    toggleBtn.title = panelCollapsed ? '展开面板' : '收起面板';
  });

  // 代码预览折叠/展开
  const codeToggle = document.getElementById('codeToggle');
  const codeWrap = document.getElementById('codePreviewWrap');
  const codeIcon = document.getElementById('codeToggleIcon');
  codeToggle.addEventListener('click', () => {
    const collapsed = codeWrap.style.display === 'none';
    codeWrap.style.display = collapsed ? 'block' : 'none';
    codeIcon.textContent = collapsed ? '▼' : '▶';
  });

  // 面板拖拽移动
  const dragHandle = document.getElementById('panelDragHandle');
  let dragging = false, dragOffsetX = 0, dragOffsetY = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target === toggleBtn) return;
    dragging = true;
    dragOffsetX = e.clientX - panel.offsetLeft;
    dragOffsetY = e.clientY - panel.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dragOffsetX) + 'px';
    panel.style.top = (e.clientY - dragOffsetY) + 'px';
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
}

async function addImageByUrl(url) {
  const existed = await addImage(url, url.split('/').pop());
  if (!existed) {
    showCopyTip('⚠️ 图片已在列表中');
    return;
  }
  currentImages = await getImages();
  renderImageList();
  updateCarouselPreview();
}

async function renderImageList() {
  const listEl = document.getElementById('imageList');
  const countEl = document.getElementById('imageCount');

  currentImages = await getImages();
  countEl.textContent = currentImages.length;

  if (currentImages.length === 0) {
    listEl.innerHTML = '<div class="empty-tip">暂无图片，请点击"一键采集"<br>或单击编辑区图片采集单张</div>';
    return;
  }

  listEl.innerHTML = currentImages
    .map((img, idx) => {
      const name = img.name.length > 18 ? img.name.substring(0, 18) + '…' : img.name;
      return `
    <div class="image-item" data-url="${img.url}">
      <span class="image-name" title="${img.url}">${name}</span>
      <div class="image-item-actions">
        <button class="btn-icon btn-move" data-action="moveUp" data-url="${img.url}" title="上移" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-icon btn-move" data-action="moveDown" data-url="${img.url}" title="下移" ${idx === currentImages.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-icon" data-action="open" data-url="${img.url}">打开</button>
        <button class="btn-icon btn-icon-danger" data-action="delete" data-url="${img.url}">✕</button>
      </div>
    </div>`;
    })
    .join('');

  listEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const url = btn.dataset.url;
      if (action === 'open') {
        window.open(url, '_blank');
      } else if (action === 'moveUp' || action === 'moveDown') {
        const allImages = await getImages();
        const idx = allImages.findIndex((img) => img.url === url);
        if (idx === -1) return;
        const newIdx = action === 'moveUp' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= allImages.length) return;
        const [moved] = allImages.splice(idx, 1);
        allImages.splice(newIdx, 0, moved);
        await saveImages(allImages);
        currentImages = allImages;
        renderImageList();
        updateCarouselPreview();
        showCopyTip(`✅ 已移至第 ${newIdx + 1} 位`);
        // 闪烁高亮被移动的项
        setTimeout(() => {
          const item = listEl.querySelector(`[data-url="${url}"]`);
          if (item) {
            item.classList.add('flash-highlight');
            setTimeout(() => item.classList.remove('flash-highlight'), 800);
          }
        }, 10);
      } else if (action === 'delete') {
        await removeImage(url);
        currentImages = await getImages();
        renderImageList();
        updateCarouselPreview();
      }
    });
  });

  // 双击列表项复制链接
  listEl.querySelectorAll('.image-item').forEach((item) => {
    item.addEventListener('dblclick', () => {
      const url = item.dataset.url;
      navigator.clipboard.writeText(url).then(() => showCopyTip('链接已复制'));
    });
  });
}

function updateCarouselPreview() {
  const previewEl = document.getElementById('codePreview');
  if (previewEl) {
    previewEl.textContent = generateCarouselHTML(currentImages);
  }
}

// ============================================================
// 编辑区单图点击采集（鼠标悬停时显示采集提示）
// ============================================================
// 编辑区点击采集
// ============================================================
function initEditorInteraction() {
  setTimeout(() => {
    bindEditorContainerEvent();
  }, 2000);
}

function bindEditorContainerEvent() {
  // 在 document 级别用 capture phase 监听所有 mousedown
  // 这样无论图片在哪个 iframe 或嵌套容器中，都能捕获到
  document.addEventListener(
    'mousedown',
    (e) => {
      const path = e.composedPath();
      const target = path.find(
        (el) => el.nodeType === 1 && el.tagName === 'IMG' && (el.dataset.src || el.src)
      );
      if (!target) return;

      e.preventDefault();
      collectSingleImage(target);
    },
    true
  );
}

// ============================================================
// 入口
// ============================================================
function bootstrap() {
  initPanel();
  initEditorInteraction();
  console.log('[轮播图助手] 插件已加载 v1.1');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}