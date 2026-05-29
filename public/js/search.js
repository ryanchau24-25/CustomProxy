const urlParams = new URLSearchParams(window.location.search);
const query = urlParams.get('q') || '';
const page = Number(urlParams.get('page') || '1');
const resultsContainer = document.querySelector('#results-container');
const summary = document.querySelector('#results-summary');
const pagination = document.querySelector('#pagination-controls');
const form = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');

async function renderSearch() {
  if (!query) {
    summary.textContent = 'Enter a query to start searching.';
    return;
  }

  summary.innerHTML = `<span class="loader"></span> Searching for "${query}"...`;
  resultsContainer.innerHTML = '';
  pagination.innerHTML = '';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`);
    const data = await res.json();
    const results = data.results || [];
    summary.textContent = `${data.total} results found for "${query}"`;

    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="muted-text">No results matched your query. Try another search.</p>';
      return;
    }

    resultsContainer.innerHTML = results
      .map(
        (item) => `
      <article class="result-card">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer">
          <h3>${item.title}</h3>
        </a>
        <p>${item.description}</p>
        <p class="muted-text">${item.source}</p>
      </article>
    `
      )
      .join('');

    renderPagination(data.page, data.totalPages);
  } catch (error) {
    summary.textContent = 'Search failed. Please try again.';
    console.error('Search request failed', error);
  }
}

function renderPagination(current, totalPages) {
  if (totalPages <= 1) return;
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    pages.push(`
      <button class="page-button ${p === current ? 'active' : ''}" data-page="${p}" type="button">${p}</button>
    `);
  }
  pagination.innerHTML = pages.join('');
  pagination.querySelectorAll('.page-button').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPage = button.dataset.page;
      window.location.href = `/search?q=${encodeURIComponent(query)}&page=${nextPage}`;
    });
  });
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextQuery = searchInput.value.trim();
    if (!nextQuery) return;
    window.location.href = `/search?q=${encodeURIComponent(nextQuery)}`;
  });
}

if (searchInput) {
  searchInput.value = query;
}

renderSearch();
