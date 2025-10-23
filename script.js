// Set current date
document.getElementById("currentDate").textContent =
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

// Set today's date as default in the date input
document.getElementById("date").valueAsDate = new Date();

// API base URL - adjust if your backend runs on a different host/port
const API_BASE = "/api/transactions";

// Get auth token from sessionStorage
function getAuthToken() {
  return sessionStorage.getItem('authToken');
}

function clearAuth() {
  sessionStorage.removeItem('authToken');
  // clear cookie by setting expiry in past
  document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function logout() {
  clearAuth();
  window.location.href = '/login.html';
}

async function fetchWithAuth(url, opts = {}) {
  const token = getAuthToken();
  if (!token) {
    // not logged in
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  opts.headers = opts.headers || {};
  opts.headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // token expired or invalid
    sessionStorage.removeItem('authToken');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  return res;
}

// Transactions will be loaded from the backend (MongoDB) via API
let transactions = [];
// Current editing transaction id (string) when editing an existing transaction
let editingId = null;

// Map server transaction (Mongoose) to client transaction shape
function mapFromServer(serverObj) {
  return {
    id: serverObj._id || serverObj.id,
    type:
      serverObj.type === "Income" || serverObj.type === "income"
        ? "income"
        : "expense",
    description: serverObj.description,
    amount: Number(serverObj.amount),
    category: serverObj.category,
    date: serverObj.date,
  };
}

// Load transactions from backend
async function fetchTransactions() {
  try {
  const res = await fetchWithAuth(API_BASE);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const data = await res.json();
    // data is an array of transactions from MongoDB
    transactions = data.map(mapFromServer);
    // keep newest first
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    console.error("Error fetching transactions:", err);
  }
}

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  // show logout button if authenticated
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    if (getAuthToken()) {
      logoutBtn.style.display = 'inline-block';
      logoutBtn.addEventListener('click', logout);
    } else {
      logoutBtn.style.display = 'none';
    }
  }
  // Fetch transactions from the backend and then render
  fetchTransactions().then(() => {
    // Update totals now that transactions are loaded
    updateDashboard();
    renderTransactions();
    updateChart();
  });

  // Form submission
  document
    .getElementById("transactionForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      addTransaction();
    });

  // Filter buttons
  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", function () {
      document
        .querySelectorAll(".filter-btn")
        .forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      filterTransactions(this.dataset.filter);
    });
  });

  // Keep reference to submit button to change its label during edit
  const submitBtn = document.querySelector(
    '#transactionForm button[type="submit"]'
  );
  // expose submitBtn for other functions
  window._submitBtn = submitBtn;
});

// Category options for each type
const incomeCategories = [
  { value: "salary", label: "Salary" },
  { value: "freelance", label: "Freelance" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

const expenseCategories = [
  { value: "food", label: "Food & Dining" },
  { value: "transport", label: "Transportation" },
  { value: "entertainment", label: "Entertainment" },
  { value: "shopping", label: "Shopping" },
  { value: "bills", label: "Bills & Utilities" },
  { value: "health", label: "Health" },
  { value: "other", label: "Other" },
];

function populateCategoryOptions(type) {
  const categorySelect = document.getElementById("category");
  // clear existing options
  categorySelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  placeholder.disabled = true;
  placeholder.selected = true;
  categorySelect.appendChild(placeholder);

  const list = type === "income" ? incomeCategories : expenseCategories;
  list.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.value;
    opt.textContent = cat.label;
    categorySelect.appendChild(opt);
  });
}

// Update categories when type changes
document.getElementById("type").addEventListener("change", function () {
  populateCategoryOptions(this.value);
});

// Populate initial category options based on default type value
populateCategoryOptions(document.getElementById("type").value);

// Add a new transaction
function addTransaction() {
  const type = document.getElementById("type").value;
  const description = document.getElementById("description").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const date = document.getElementById("date").value;
  // Basic client-side validation
  if (!description || !amount || !category) {
    console.error("Description, amount and category are required");
    return;
  }

  // Convert type to server-expected enum values
  const serverType = type === "income" ? "Income" : "Expense";
  const payload = { type: serverType, description, amount, category, date };

  // If editing, send PUT to update
  if (editingId) {
    fetchWithAuth(`${API_BASE}/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to update transaction");
        return res.json();
      })
      .then((updated) => {
        // update locally
        const mapped = mapFromServer(updated);
        transactions = transactions.map((t) =>
          t.id === editingId ? mapped : t
        );
        editingId = null;
        if (window._submitBtn)
          window._submitBtn.textContent = "Add Transaction";
        document.getElementById("transactionForm").reset();
        document.getElementById("date").valueAsDate = new Date();
        updateDashboard();
        renderTransactions();
        updateChart();
      })
      .catch((err) => console.error(err));
    return;
  }

  // POST to backend
  fetchWithAuth(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to add transaction");
      return res.json();
    })
    .then((created) => {
      // created should be the saved transaction from MongoDB (with _id)
      // normalize to local shape
      transactions.unshift(mapFromServer(created));
      updateDashboard();
      renderTransactions();
      updateChart();
      document.getElementById("transactionForm").reset();
      document.getElementById("date").valueAsDate = new Date();
    })
    .catch((err) => console.error(err));
}

// Start editing a transaction
function startEdit(id) {
  const tx = transactions.find((t) => String(t.id) === String(id));
  if (!tx) return;
  editingId = String(id);
  document.getElementById("type").value = tx.type;
  populateCategoryOptions(tx.type);
  document.getElementById("category").value = tx.category;
  document.getElementById("description").value = tx.description;
  document.getElementById("amount").value = tx.amount;
  const dateInput = document.getElementById("date");
  dateInput.value = new Date(tx.date).toISOString().split("T")[0];
  if (window._submitBtn) window._submitBtn.textContent = "Update Transaction";
}

// Delete a transaction
function deleteTransaction(id) {
  // If id is a MongoDB ObjectId string, pass it directly. Our local map uses id as string.
  fetchWithAuth(`${API_BASE}/${id}`, { method: "DELETE" })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to delete");
      // remove locally
      transactions = transactions.filter(
        (transaction) => transaction.id !== id
      );
      updateDashboard();
      renderTransactions();
      updateChart();
    })
    .catch((err) => console.error(err));
}

// Update dashboard totals
function updateDashboard() {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  document.getElementById("totalIncome").textContent = totalIncome.toFixed(2);
  document.getElementById("totalExpenses").textContent =
    totalExpenses.toFixed(2);
  document.getElementById("currentBalance").textContent = balance.toFixed(2);
}

// Render transactions list
function renderTransactions(filter = "all") {
  const transactionsList = document.getElementById("transactionsList");
  const emptyState = document.getElementById("emptyState");

  // Filter transactions
  let filteredTransactions = transactions;
  if (filter !== "all") {
    filteredTransactions = transactions.filter((t) => t.type === filter);
  }

  if (filteredTransactions.length === 0) {
    transactionsList.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  transactionsList.innerHTML = filteredTransactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(
      (transaction) => `
            <tr class="expense-row">
                <td>${transaction.description}</td>
                <td><span class="category">${transaction.category}</span></td>
                <td>${new Date(transaction.date).toLocaleDateString()}</td>
                <td class="expense-amount ${
                  transaction.type === "income"
                    ? "expense-income"
                    : "expense-expense"
                }">
                    ${
                      transaction.type === "income" ? "+" : "-"
                    }$${transaction.amount.toFixed(2)}
                </td>
                <td class="actions">
                    <button class="action-btn edit" onclick="startEdit('${
                      transaction.id
                    }')" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" onclick="deleteTransaction('${
                      transaction.id
                    }')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `
    )
    .join("");
}

// Filter transactions
function filterTransactions(filter) {
  renderTransactions(filter);
}

// Update chart
function updateChart() {
  // Create a pie chart using CSS conic-gradient showing expense breakdown by category
  const chart = document.getElementById("expenseChart");
  const categories = [
    "food",
    "transport",
    "entertainment",
    "shopping",
    "bills",
    "health",
    "other",
  ];
  const categoryNames = {
    food: "Food",
    transport: "Transport",
    entertainment: "Entertainment",
    shopping: "Shopping",
    bills: "Bills",
    health: "Health",
    other: "Other",
  };

  const expensesByCategory = {};
  categories.forEach((cat) => {
    expensesByCategory[cat] = transactions
      .filter((t) => t.type === "expense" && t.category === cat)
      .reduce((s, t) => s + t.amount, 0);
  });

  const total = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);
  if (total === 0) {
    chart.innerHTML = '<div class="pie-empty">No expenses yet</div>';
    return;
  }

  // Build conic-gradient segments
  let start = 0;
  const colors = [
    "#4361ee",
    "#3a0ca3",
    "#4cc9f0",
    "#f72585",
    "#f8961e",
    "#90be6d",
    "#a0a0a0",
  ];
  const segments = [];
  const legend = [];
  categories.forEach((cat, i) => {
    const value = expensesByCategory[cat];
    if (value <= 0) return;
    const portion = (value / total) * 100;
    const end = start + portion;
    segments.push(`${colors[i % colors.length]} ${start}% ${end}%`);
    legend.push({
      color: colors[i % colors.length],
      name: categoryNames[cat],
      value,
    });
    start = end;
  });

  const gradient = `conic-gradient(${segments.join(",")})`;
  chart.innerHTML = `
    <div class="pie" style="background: ${gradient}"></div>
    <div class="legend">${legend
      .map(
        (l) =>
          `<div class="legend-item"><span class="swatch" style="background:${
            l.color
          }"></span><span class="name">${
            l.name
          }</span><span class="value">$${l.value.toFixed(2)}</span></div>`
      )
      .join("")}</div>
  `;
}
