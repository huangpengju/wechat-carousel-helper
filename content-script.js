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
    await renderImageList();
    // renderImageList 内部已调用 updateCarouselPreview
  } else {
    showCopyTip('⚠️ 图片已在列表中');
  }
}

// ============================================================
// 轮播代码生成
// ============================================================
let targetImageSize = null; // 用户选择的参考高度

function generateCarouselHTML(images) {
  if (!images || images.length === 0) {
    return '<!-- 暂无图片，请先采集图片 -->';
  }

  const n = images.length;
  const uid = 'c' + Date.now();

  // 生成图片 JSON 配置（用于微信编辑器识别）
  const imgsJson = images
    .map(() => {
      return `{"w":1440,"h":1863,"imgid":"${Math.floor(10000000 + Math.random() * 90000000)}","group":"202633605"}`;
    })
    .join(',');

  const dataJson = `%7B%22custom%22%3A%7B%22imgs%22%3A%5B${imgsJson}%5D%7D%2C%22id%22%3A%2213%22%7D`;

  // 图片区块
  const imgSections = images
    .map((img, idx) => {
      const marginLeft = idx === 0 ? '0' : '4px';
      const marginRight = idx === n - 1 ? '0' : '4px';
      let imgHtml = `<img style="vertical-align: top; border-radius: 6px;" src="${img.url}" />`;
      let wrapperStyle = `vertical-align: top; display: inline-block; text-align: center; font-size: 0; line-height: 0; margin: 0 ${marginRight} 0 ${marginLeft};`;

      // 如果设置了参考高度，用固定高度容器包裹图片
      if (targetImageSize && window._detectedSizes && window._detectedSizes[idx]) {
        const originalSize = window._detectedSizes[idx];
        const scaledWidth = Math.round(originalSize.width * (targetImageSize.height / originalSize.height));
        // 使用固定像素值 + !important 覆盖 WeChat 可能添加的任何默认样式
        return `<section style="${wrapperStyle} width: ${scaledWidth}px; height: ${targetImageSize.height}px; overflow: hidden; border-radius: 6px; flex-shrink: 0;">
  <img width="${scaledWidth}" height="${targetImageSize.height}" style="width: ${scaledWidth}px !important; height: ${targetImageSize.height}px !important; object-fit: cover !important; vertical-align: top; border-radius: 6px; display: block;" src="${img.url}" />
</section>`;
      }

      return `<section style="${wrapperStyle}">
    ${imgHtml}
</section>`;
    })
    .join('\n');

  // 滚动指示器圆点（统一颜色）
  const dots = images.map(() => {
    return `<section style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #999; margin: 0 2px; vertical-align: middle;"></section>`;
  }).join('');

  return `<section _editor copyright="huangpengju" style="background-repeat: repeat; background-position: left top; background-size: auto; text-align: center;">
    <section class="block" style="margin: 0; padding: 0; text-align: left;">
        <section class="block-inner">
            <section _editor>
                <section class="svg" data-json="${dataJson}">
                    <section style="transform: scale(1); line-height: 0; font-size: 0; padding: 0; margin: 0;">
                        <section style="overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; vertical-align: top; display: block; width: 100%;">
                            <section id="${uid}" style="white-space: nowrap; overflow-x: scroll; overflow-y: hidden; line-height: 0; font-size: 0; display: inline-block; width: max-content; min-width: 100%;">
${imgSections}
                            </section>
                        </section>
                        <section style="text-align: center; padding: 12px 0 0; font-size: 0;">
                            <section style="display: inline-flex; align-items: center; gap: 6px; vertical-align: middle;">
                                ${dots}
                            </section>
                        </section>
                        <section style="text-align: center; padding: 10px 0 0; font-size: 0;">
                            <section style="display: inline-block; background: #f5f5f5; border-radius: 16px; padding: 6px 16px; margin: 0 auto;">
                                <p style="margin: 0; font-size: 12px; color: #666; letter-spacing: 1px; line-height: 1.6;">←左右滑动查看更多→</p>
                                <p style="margin: 0; font-size: 11px; color: #999; letter-spacing: 0.5px; line-height: 1.6;">Slide for more photos</p>
                            </section>
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
// 存储层 - 插件开关状态
// ============================================================
const PLUGIN_ENABLED_KEY = 'pluginEnabled';

async function getPluginEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get(PLUGIN_ENABLED_KEY, (result) => {
      resolve(result[PLUGIN_ENABLED_KEY] ?? true);
    });
  });
}

async function setPluginEnabled(enabled) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PLUGIN_ENABLED_KEY]: enabled }, resolve);
  });
}

// ============================================================
// 面板 UI
// ============================================================
let panel = null;
let panelToggleBtn = null;
let currentImages = [];
let pluginEnabled = true;

function initPanel() {
  if (panel) return;
  getPluginEnabled().then(async (enabled) => {
    pluginEnabled = enabled;
    const imgs = await getImages();
    currentImages = imgs;
    createPanel();
    await renderImageList();
    updatePanelVisibility();
  });
}

function createPanel() {
  // 创建悬浮小按钮
  panelToggleBtn = document.createElement('div');
  panelToggleBtn.id = 'img-collector-toggle';
  panelToggleBtn.innerHTML = `
    <div class="toggle-icon" id="toggleIcon">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </div>
    <div class="toggle-dot" id="toggleDot"></div>
  `;
  document.body.appendChild(panelToggleBtn);

  // 创建主面板
  panel = document.createElement('div');
  panel.id = 'img-collector-panel';
  panel.innerHTML = `
    <div class="panel-header" id="panelDragHandle" style="cursor:move;">
      <span class="panel-title">🖼 轮播图助手</span>
      <div class="panel-header-right">
        <label class="switch-label" title="插件开关">
          <input type="checkbox" id="pluginSwitch" checked>
          <span class="switch-slider"></span>
        </label>
        <button class="panel-toggle-btn" id="panelToggleClose" title="收起面板">−</button>
      </div>
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

      <div class="size-sync-section" id="sizeSyncSection" style="display:none;">
        <div class="size-sync-header">
          <span>📐 尺寸统一</span>
          <button class="btn-icon" id="refreshSizeBtn" title="刷新尺寸">↻</button>
        </div>
        <div class="size-list" id="sizeList"></div>
        <button class="btn-primary btn-small" id="syncSizeBtn" disabled>应用选中尺寸</button>
        <div class="custom-size-section" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
          <div style="font-size: 12px; color: #666; margin-bottom: 6px;">或自定义高度（宽度自动等比）</div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="number" id="customHeightInput" placeholder="输入高度，如 400" style="flex: 1; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
            <span style="color: #999; font-size: 12px;">px</span>
            <button class="btn-secondary btn-small" id="applyCustomHeightBtn" style="padding: 6px 12px;">应用</button>
          </div>
        </div>
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
  panel.style.display = 'none';
  document.body.appendChild(panel);
  bindPanelEvents();
}

function updatePanelVisibility() {
  if (!panelToggleBtn) return;
  const toggleDot = document.getElementById('toggleDot');
  if (toggleDot) {
    toggleDot.style.background = pluginEnabled ? '#07c160' : '#999';
  }
}

function showPanel() {
  if (!panel) return;
  panel.style.display = 'flex';
  panelToggleBtn.classList.add('hidden');
}

function hidePanel() {
  if (!panel) return;
  panel.style.display = 'none';
  if (panelToggleBtn) panelToggleBtn.classList.remove('hidden');
}

function bindPanelEvents() {
  // 悬浮小按钮点击显示面板
  panelToggleBtn.addEventListener('click', () => {
    showPanel();
  });

  // 关闭按钮收起面板
  document.getElementById('panelToggleClose').addEventListener('click', () => {
    hidePanel();
  });

  // 插件开关
  const pluginSwitch = document.getElementById('pluginSwitch');
  pluginSwitch.checked = pluginEnabled;
  pluginSwitch.addEventListener('change', async (e) => {
    pluginEnabled = e.target.checked;
    await setPluginEnabled(pluginEnabled);
    updatePanelVisibility();
    if (!pluginEnabled) {
      await clearImages();
      currentImages = [];
      targetImageSize = null;
      window._detectedSizes = null;
      const section = document.getElementById('sizeSyncSection');
      if (section) section.style.display = 'none';
      const listEl = document.getElementById('imageList');
      if (listEl) listEl.classList.remove('has-size-section');
      await renderImageList();
      showCopyTip('🚫 插件已禁用');
    } else {
      showCopyTip('✅ 插件已启用');
    }
  });

  document.getElementById('collectBtn').addEventListener('click', async () => {
    if (!pluginEnabled) return;
    currentImages = await collectFromEditor();
    await renderImageList();
    // renderImageList 内部已调用 updateCarouselPreview
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!pluginEnabled) return;
    if (confirm('确定清空所有图片？')) {
      await clearImages();
      currentImages = [];
      // 重置尺寸相关状态
      targetImageSize = null;
      window._detectedSizes = null;
      // 隐藏尺寸统一区域
      const section = document.getElementById('sizeSyncSection');
      if (section) section.style.display = 'none';
      const listEl = document.getElementById('imageList');
      if (listEl) listEl.classList.remove('has-size-section');
      await renderImageList();
      // renderImageList 内部已调用 updateCarouselPreview
    }
  });

  document.getElementById('addUrlBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    const url = prompt('请输入图片链接：');
    if (url && url.startsWith('http')) {
      addImageByUrl(url);
    }
  });

  document.getElementById('copyTextBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    copyAsPlainText(document.getElementById('codePreview').textContent);
  });

  document.getElementById('copyRichBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    copyAsRichText(document.getElementById('codePreview').textContent);
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
    if (e.target.closest('.switch-label') || e.target.closest('#panelToggleClose')) return;
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

  // 尺寸统一功能
  document.getElementById('refreshSizeBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    detectAndShowSizes();
  });

  document.getElementById('syncSizeBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    applySelectedSize();
  });

  document.getElementById('applyCustomHeightBtn').addEventListener('click', () => {
    if (!pluginEnabled) return;
    const input = document.getElementById('customHeightInput');
    const height = parseInt(input.value);
    if (!height || height <= 0) {
      showCopyTip('请输入有效的高度值');
      return;
    }
    targetImageSize = { height: height };
    updateCarouselPreview();
    showCopyTip(`已按自定义高度 ${height}px 统一图片尺寸`);
  });
}

// 检测图片尺寸并显示（同步等待，确保尺寸检测完成后再返回）
async function detectAndShowSizes() {
  const section = document.getElementById('sizeSyncSection');
  const sizeList = document.getElementById('sizeList');
  const syncBtn = document.getElementById('syncSizeBtn');
  const listEl = document.getElementById('imageList');

  if (currentImages.length === 0) {
    showCopyTip('请先采集图片');
    return;
  }

  section.style.display = 'block';
  listEl.classList.add('has-size-section');
  sizeList.innerHTML = '<div class="size-loading">检测图片尺寸中...</div>';

  // 同步等待所有图片加载完成
  const sizes = await detectImageSizes(currentImages.map(img => img.url));

  if (sizes.length === 0) {
    sizeList.innerHTML = '<div class="size-loading">无法检测图片尺寸</div>';
    listEl.classList.remove('has-size-section');
    return;
  }

  // 显示尺寸列表，默认选中第一项
  sizeList.innerHTML = sizes.map((size, idx) => `
    <div class="size-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}" data-width="${size.width}" data-height="${size.height}">
      <span class="size-info">${size.width} × ${size.height}</span>
      <span class="size-ratio">${size.width / size.height < 1 ? '竖图' : '横图'}</span>
    </div>
  `).join('');

  // 存储检测到的尺寸
  window._detectedSizes = sizes;
  syncBtn.disabled = false;

  // 点击选择尺寸
  sizeList.querySelectorAll('.size-item').forEach(item => {
    item.addEventListener('click', () => {
      sizeList.querySelectorAll('.size-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
    });
  });

  // 自动应用第一个的图片高度作为参考
  const firstSize = sizes[0];
  if (firstSize) {
    targetImageSize = { height: firstSize.height };
    updateCarouselPreview();
    showCopyTip(`已按首图高度 ${firstSize.height}px 统一尺寸`);
  }
}

// 检测一组图片的尺寸
function detectImageSizes(urls) {
  return Promise.all(urls.map(url => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  })).then(results => results.filter(Boolean));
}

// 应用选中的尺寸到轮播代码
function applySelectedSize() {
  const sizeList = document.getElementById('sizeList');
  const selected = sizeList.querySelector('.size-item.selected');

  if (!selected) {
    showCopyTip('请先选择参考尺寸');
    return;
  }

  // 检查尺寸是否已检测
  if (!window._detectedSizes || window._detectedSizes.length === 0) {
    showCopyTip('请等待图片尺寸检测完成');
    return;
  }

  const targetHeight = parseInt(selected.dataset.height);
  const selectedIndex = parseInt(selected.dataset.index);

  // 获取选中项对应的原始图片尺寸
  const originalSize = window._detectedSizes[selectedIndex];
  if (!originalSize) {
    showCopyTip('无法获取选中图片的原始尺寸');
    return;
  }

  // 计算按目标高度等比缩放后的宽度
  const scaledWidth = Math.round(originalSize.width * (targetHeight / originalSize.height));

  targetImageSize = { height: targetHeight };

  showCopyTip(`已按高度 ${targetHeight}px 统一图片尺寸`);
  updateCarouselPreview();
}

async function addImageByUrl(url) {
  const existed = await addImage(url, url.split('/').pop());
  if (!existed) {
    showCopyTip('⚠️ 图片已在列表中');
    return;
  }
  currentImages = await getImages();
  await renderImageList();
  // renderImageList 内部已调用 updateCarouselPreview
}

async function renderImageList() {
  const listEl = document.getElementById('imageList');
  const countEl = document.getElementById('imageCount');

  currentImages = await getImages();
  countEl.textContent = currentImages.length;

  if (currentImages.length === 0) {
    listEl.innerHTML = '<div class="empty-tip">暂无图片，请点击"一键采集"<br>或单击编辑区图片采集单张</div>';
    // 清空尺寸列表
    listEl.classList.remove('has-size-section');
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

  // 检测图片尺寸并显示（同步等待，确保预览时尺寸已检测）
  await detectAndShowSizes();

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
        await renderImageList();
        // renderImageList 内部已调用 updateCarouselPreview
        showCopyTip(`✅ 已移至第 ${newIdx + 1} 位`);
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
        await renderImageList();
        // renderImageList 内部已调用 updateCarouselPreview
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

  // 尺寸检测完成后更新预览
  updateCarouselPreview();
}

function updateCarouselPreview() {
  const previewEl = document.getElementById('codePreview');
  if (previewEl) {
    previewEl.textContent = generateCarouselHTML(currentImages);
  }
}

// ============================================================
// 编辑区单图点击采集
// ============================================================
let editorBindingDone = false;

function initEditorInteraction() {
  setTimeout(() => {
    if (!editorBindingDone) {
      bindEditorContainerEvent();
      editorBindingDone = true;
    }
  }, 2000);
}

function bindEditorContainerEvent() {
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!pluginEnabled) return;
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
  console.log('[轮播图助手] 插件已加载');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
