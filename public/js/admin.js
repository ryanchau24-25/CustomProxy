const userTable = document.querySelector('#user-table');
const historyTable = document.querySelector('#search-history');

function renderUsers(users) {
  if (!userTable) return;
  userTable.innerHTML = `<table>
      <thead><tr><th>Email</th><th>Name</th><th>Admin</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${users
        .map(
          (user) => `
            <tr>
              <td>${user.email}</td>
              <td>${user.displayName}</td>
              <td>${user.isAdmin ? '<span class="label-pill">Admin</span>' : 'User'}</td>
              <td>${new Date(user.createdAt).toLocaleString()}</td>
              <td><button class="secondary-btn delete-user" data-id="${user.id}">Remove</button></td>
            </tr>
          `
        )
        .join('')}</tbody>
    </table>`;

  userTable.querySelectorAll('.delete-user').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadAdminData();
    });
  });
}

function renderSearchHistory(history) {
  if (!historyTable) return;
  historyTable.innerHTML = `<table>
      <thead><tr><th>Query</th><th>User</th><th>Matches</th><th>Time</th></tr></thead>
      <tbody>${history
        .map(
          (entry) => `
            <tr>
              <td>${entry.query}</td>
              <td>${entry.displayName || 'Guest'}</td>
              <td>${entry.resultsCount}</td>
              <td>${new Date(entry.createdAt).toLocaleString()}</td>
            </tr>
          `
        )
        .join('')}</tbody>
    </table>`;
}

async function loadAdminData() {
  try {
    const usersResponse = await fetch('/api/admin/users');
    const usersData = await usersResponse.json();
    renderUsers(usersData.users || []);

    const historyResponse = await fetch('/api/admin/history');
    const historyData = await historyResponse.json();
    renderSearchHistory(historyData.history || []);
  } catch (error) {
    console.error('Unable to load admin data:', error);
    if (userTable) userTable.textContent = 'Unable to load admin content.';
    if (historyTable) historyTable.textContent = 'Unable to load admin content.';
  }
}

loadAdminData();
