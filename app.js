(() => {
  const DB_NAME = 'hd_locator';
  const DB_VERSION = 2;
  const STORE_NAME = 'products';
  const SETTINGS_STORE = 'settings';
  const LS_KEY = 'hd_products';
  const JSONBLOB_BASE = 'https://jsonblob.com/api/jsonBlob';

  // DOM refs
  const searchInput = document.getElementById('searchInput');
  const addBtn = document.getElementById('addBtn');
  const productList = document.getElementById('productList');
  const emptyState = document.getElementById('emptyState');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const productForm = document.getElementById('productForm');
  const productId = document.getElementById('productId');
  const productName = document.getElementById('productName');
  const productAisle = document.getElementById('productAisle');
  const productBay = document.getElementById('productBay');
  const productNotes = document.getElementById('productNotes');
  const cancelBtn = document.getElementById('cancelBtn');
  const confirmModal = document.getElementById('confirmModal');
  const confirmCancel = document.getElementById('confirmCancel');
  const confirmDelete = document.getElementById('confirmDelete');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const syncBtn = document.getElementById('syncBtn');
  const syncModal = document.getElementById('syncModal');
  const syncStatus = document.getElementById('syncStatus');
  const syncKeyDisplay = document.getElementById('syncKeyDisplay');
  const syncKeyValue = document.getElementById('syncKeyValue');
  const syncCopyBtn = document.getElementById('syncCopyBtn');
  const syncKeyInput = document.getElementById('syncKeyInput');
  const syncLinkBtn = document.getElementById('syncLinkBtn');
  const syncCloseBtn = document.getElementById('syncCloseBtn');

  let products = [];
  let db = null;
  let deleteTargetId = null;

  // --- IndexedDB ---
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const idb = request.result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) {
          idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!idb.objectStoreNames.contains(SETTINGS_STORE)) {
          idb.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function loadAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function putProduct(product) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(product);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function removeProduct(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function clearStore() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Settings store ---
  function getSetting(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  }

  function putSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Cloud sync ---
  async function syncToCloud() {
    try {
      const blobId = await getSetting('blobId');
      if (blobId) {
        await fetch(`${JSONBLOB_BASE}/${blobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(products),
        });
      } else {
        const res = await fetch(JSONBLOB_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(products),
        });
        const location = res.headers.get('Location');
        if (location) {
          const newBlobId = location.split('/').pop();
          await putSetting('blobId', newBlobId);
        }
      }
    } catch {
      // sync failed silently — offline or network error
    }
  }

  async function syncFromCloud(blobId) {
    const res = await fetch(`${JSONBLOB_BASE}/${blobId}`);
    if (!res.ok) throw new Error('Failed to fetch blob');
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid blob data');
    await clearStore();
    for (const item of data) {
      if (!item.id || !item.name) continue;
      await putProduct(item);
    }
    products = await loadAll();
    render();
  }

  // --- Migration from localStorage ---
  async function migrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length === 0) return;
      for (const item of data) {
        await putProduct(item);
      }
      localStorage.removeItem(LS_KEY);
    } catch {
      // migration failed silently — localStorage data stays as fallback
    }
  }

  // --- Render ---
  function render() {
    const query = searchInput.value.trim().toLowerCase();
    let filtered = products.slice().sort((a, b) => {
      const aisleDiff = (parseInt(a.aisle, 10) || 0) - (parseInt(b.aisle, 10) || 0);
      if (aisleDiff !== 0) return aisleDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.aisle.toLowerCase().includes(query) ||
        p.notes.toLowerCase().includes(query)
      );
    }

    if (filtered.length === 0) {
      productList.innerHTML = '';
      emptyState.textContent = query
        ? 'No products match your search.'
        : 'No products yet. Tap "Add Product" to get started.';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    productList.innerHTML = filtered.map(p => `
      <div class="product-card" data-id="${p.id}">
        <div class="product-location">
          <div class="aisle-label">Aisle</div>
          <div class="aisle-num">${esc(p.aisle)}</div>
          ${p.bay ? `<div class="bay-label">Bay ${esc(p.bay)}</div>` : ''}
        </div>
        <div class="product-info">
          <div class="name">${esc(p.name)}</div>
          ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}
        </div>
        <button class="product-delete" data-delete="${p.id}" aria-label="Delete">&times;</button>
      </div>
    `).join('');
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Modal ---
  function openModal(product) {
    if (product) {
      modalTitle.textContent = 'Edit Product';
      productId.value = product.id;
      productName.value = product.name;
      productAisle.value = product.aisle;
      productBay.value = product.bay;
      productNotes.value = product.notes;
    } else {
      modalTitle.textContent = 'Add Product';
      productForm.reset();
      productId.value = '';
    }
    modal.classList.remove('hidden');
    productName.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  // --- CRUD ---
  async function saveProduct() {
    const id = productId.value;
    const data = {
      name: productName.value.trim(),
      aisle: productAisle.value.trim(),
      bay: productBay.value.trim(),
      notes: productNotes.value.trim(),
    };

    if (id) {
      const idx = products.findIndex(p => p.id === id);
      if (idx !== -1) {
        products[idx] = { ...products[idx], ...data };
        await putProduct(products[idx]);
      }
    } else {
      const product = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
      };
      products.push(product);
      await putProduct(product);
    }

    render();
    closeModal();
    syncToCloud();
  }

  async function deleteProduct(id) {
    products = products.filter(p => p.id !== id);
    await removeProduct(id);
    render();
    syncToCloud();
  }

  // --- Export / Import ---
  function exportData() {
    const json = JSON.stringify(products, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hd-products.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Invalid format');
      await clearStore();
      for (const item of data) {
        if (!item.id || !item.name) continue;
        await putProduct(item);
      }
      products = await loadAll();
      render();
      syncToCloud();
    } catch {
      alert('Failed to import. Make sure the file is a valid HD products JSON export.');
    }
  }

  // --- Sync modal ---
  async function openSyncModal() {
    syncModal.classList.remove('hidden');
    syncKeyInput.value = '';
    const blobId = await getSetting('blobId');
    if (blobId) {
      syncStatus.textContent = 'Syncing to cloud.';
      syncKeyDisplay.classList.remove('hidden');
      syncKeyValue.value = blobId;
    } else {
      syncStatus.textContent = 'Not synced yet. A sync key will be created on your next data change, or paste one below to link.';
      syncKeyDisplay.classList.add('hidden');
    }
  }

  function closeSyncModal() {
    syncModal.classList.add('hidden');
  }

  async function linkSyncKey() {
    const key = syncKeyInput.value.trim();
    if (!key) return;
    syncLinkBtn.disabled = true;
    syncLinkBtn.textContent = 'Linking...';
    try {
      await putSetting('blobId', key);
      await syncFromCloud(key);
      syncLinkBtn.textContent = 'Link';
      syncLinkBtn.disabled = false;
      closeSyncModal();
    } catch {
      alert('Failed to fetch data with that sync key. Check the key and try again.');
      syncLinkBtn.textContent = 'Link';
      syncLinkBtn.disabled = false;
    }
  }

  // --- Events ---
  searchInput.addEventListener('input', render);

  addBtn.addEventListener('click', () => openModal(null));

  cancelBtn.addEventListener('click', closeModal);

  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  productForm.addEventListener('submit', e => {
    e.preventDefault();
    saveProduct();
  });

  productList.addEventListener('click', e => {
    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      e.stopPropagation();
      deleteTargetId = deleteBtn.dataset.delete;
      confirmModal.classList.remove('hidden');
      return;
    }

    const card = e.target.closest('.product-card');
    if (card) {
      const product = products.find(p => p.id === card.dataset.id);
      if (product) openModal(product);
    }
  });

  confirmCancel.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    deleteTargetId = null;
  });

  confirmModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    deleteTargetId = null;
  });

  confirmDelete.addEventListener('click', () => {
    if (deleteTargetId) {
      deleteProduct(deleteTargetId);
      deleteTargetId = null;
    }
    confirmModal.classList.add('hidden');
  });

  exportBtn.addEventListener('click', exportData);

  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', () => {
    if (importFile.files.length > 0) {
      importData(importFile.files[0]);
      importFile.value = '';
    }
  });

  syncBtn.addEventListener('click', openSyncModal);

  syncCloseBtn.addEventListener('click', closeSyncModal);

  syncModal.querySelector('.modal-backdrop').addEventListener('click', closeSyncModal);

  syncCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(syncKeyValue.value).then(() => {
      syncCopyBtn.textContent = 'Copied!';
      setTimeout(() => { syncCopyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  syncLinkBtn.addEventListener('click', linkSyncKey);

  // --- Init ---
  async function init() {
    db = await openDB();
    await migrateFromLocalStorage();
    products = await loadAll();
    render();

    // Auto-sync from cloud on startup if we have a blob ID
    const blobId = await getSetting('blobId');
    if (blobId) {
      try {
        await syncFromCloud(blobId);
      } catch {
        // offline or blob expired — use local data
      }
    }

    // Request persistent storage
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist();
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js');
    }
  }

  init();
})();
