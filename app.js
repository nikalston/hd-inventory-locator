(() => {
  const STORAGE_KEY = 'hd_products';

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

  let products = [];
  let deleteTargetId = null;

  // --- Storage ---
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      products = Array.isArray(data) ? data : [];
    } catch {
      products = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }

  // --- Render ---
  function render() {
    const query = searchInput.value.trim().toLowerCase();
    let filtered = products.slice().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

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
    setTimeout(() => productName.focus(), 100);
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  // --- CRUD ---
  function saveProduct() {
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
      }
    } else {
      products.push({
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
      });
    }

    save();
    render();
    closeModal();
  }

  function deleteProduct(id) {
    products = products.filter(p => p.id !== id);
    save();
    render();
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

  // --- Init ---
  load();
  render();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
})();
