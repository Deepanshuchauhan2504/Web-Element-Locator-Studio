// AutoLocator Studio Client Engine

// Application State
let state = {
    elements: [],
    selectedElements: new Set(),
    activeElementId: null,
    currentFramework: 'playwright_ts',
    currentCasing: 'camelCase',
    categoryFilter: 'all',
    searchQuery: '',
    rawHtml: '',
    url: ''
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Set default framework in UI
    const fwSelect = document.getElementById('framework-select');
    if (fwSelect) state.currentFramework = fwSelect.value;

    const casingSelect = document.getElementById('global-casing');
    if (casingSelect) state.currentCasing = casingSelect.value;
});

// Switch Input Tab
function switchInputTab(tabType) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tabType === 'url') {
        document.getElementById('url-tab-btn').classList.add('active');
        document.getElementById('url-tab-content').classList.add('active');
    } else {
        document.getElementById('html-tab-btn').classList.add('active');
        document.getElementById('html-tab-content').classList.add('active');
    }
}

// API Helpers & Loading States
function setScanningState(btnId, isScanning) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    if (isScanning) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning...`;
    } else {
        btn.disabled = false;
        if (btnId === 'url-submit-btn') {
            btn.innerHTML = `<span>Scan Webpage</span> <i class="fa-solid fa-arrow-right"></i>`;
        } else {
            btn.innerHTML = `<span>Analyze Source</span> <i class="fa-solid fa-bolt"></i>`;
        }
    }
}

// Submit URL Scan
async function handleUrlSubmit(event) {
    event.preventDefault();
    const urlInput = document.getElementById('page-url');
    const url = urlInput.value.strip ? urlInput.value.strip() : urlInput.value.trim();
    if (!url) return;

    setScanningState('url-submit-btn', true);
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            loadWorkspace(data.elements, url, data.elements.length > 0 ? data.elements[0].fullHtml : '');
            showToast(`Scanned webpage successfully! Found ${data.elements.length} elements.`, 'success');
        }
    } catch (err) {
        showToast('Network error while scanning URL.', 'error');
        console.error(err);
    } finally {
        setScanningState('url-submit-btn', false);
    }
}

// Submit pasted HTML source
async function handleHtmlSubmit(event) {
    event.preventDefault();
    const htmlTextarea = document.getElementById('raw-html');
    const htmlContent = htmlTextarea.value;
    if (!htmlContent.trim()) return;

    setScanningState('html-submit-btn', true);
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: htmlContent })
        });
        
        const data = await response.json();
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            loadWorkspace(data.elements, 'Pasted HTML', htmlContent);
            showToast(`Parsed HTML successfully! Found ${data.elements.length} elements.`, 'success');
        }
    } catch (err) {
        showToast('Network error while parsing HTML.', 'error');
        console.error(err);
    } finally {
        setScanningState('html-submit-btn', false);
    }
}

// Load workspace after data retrieval
function loadWorkspace(elements, source, rawHtml) {
    // Populate state
    state.elements = elements.map(el => {
        // Find default primary locator (highest score)
        const primaryLoc = el.locators && el.locators.length > 0 ? el.locators[0] : null;
        return {
            ...el,
            customName: el.names[state.currentCasing],
            primaryLocatorType: primaryLoc ? primaryLoc.type : '',
            primaryLocatorValue: primaryLoc ? primaryLoc.value : ''
        };
    });
    
    state.selectedElements = new Set(state.elements.map(el => el.id)); // select all by default
    state.activeElementId = null;
    state.rawHtml = rawHtml;
    state.url = source;
    
    // Toggle dashboard UI visibility
    document.getElementById('main-workspace').style.display = 'grid';
    document.getElementById('preview-drawer-btn').style.display = 'flex';
    
    // Update counters and render list
    updateSummaryStats();
    renderElementsList();
    resetInspector();
    
    // Initialize Visual Sandbox
    initSandboxFrame();
    
    // Select the first element by default
    if (state.elements.length > 0) {
        selectElement(state.elements[0].id);
    }
    
    // Render code preview
    generateCode();
}

// Calculate element category tallies
function updateSummaryStats() {
    document.getElementById('total-count-badge').innerText = `${state.elements.length} Found`;
    
    const tallies = { all: 0, button: 0, input: 0, link: 0 };
    state.elements.forEach(el => {
        tallies.all++;
        if (tallies[el.type] !== undefined) {
            tallies[el.type]++;
        }
    });
    
    document.getElementById('cnt-all').innerText = tallies.all;
    document.getElementById('cnt-button').innerText = tallies.button;
    document.getElementById('cnt-input').innerText = tallies.input;
    document.getElementById('cnt-link').innerText = tallies.link;
}

// Render Elements scroll explorer list
function renderElementsList() {
    const listContainer = document.getElementById('elements-list');
    listContainer.innerHTML = '';
    
    const filtered = getFilteredElements();
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state-list" style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-folder-open" style="font-size: 2rem; opacity: 0.3; margin-bottom: 10px;"></i>
                <p style="font-size: 0.85rem;">No elements match the current filters.</p>
            </div>
        `;
        return;
    }
    
    filtered.forEach(el => {
        const isActive = el.id === state.activeElementId;
        const isChecked = state.selectedElements.has(el.id);
        
        const card = document.createElement('div');
        card.className = `element-card ${isActive ? 'active' : ''}`;
        card.setAttribute('data-id', el.id);
        card.onclick = () => selectElement(el.id);
        
        card.innerHTML = `
            <div class="element-card-checkbox" onclick="event.stopPropagation();">
                <label class="checkbox-container">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleElementSelection('${el.id}', this.checked)" />
                    <span class="checkmark"></span>
                </label>
            </div>
            <div class="element-card-content">
                <div class="card-header-row">
                    <span class="card-title-text" title="${el.customName}">${el.customName}</span>
                    <span class="card-tag-badge">${el.tag}</span>
                </div>
                <div class="card-desc">
                    <span class="badge-type">${el.type}</span> 
                    <span>${el.text ? `"${el.text}"` : (el.attributes.placeholder ? `[${el.attributes.placeholder}]` : '')}</span>
                </div>
            </div>
        `;
        
        listContainer.appendChild(card);
    });
    
    // Update Bulk Select Checkbox State
    const allFilteredChecked = filtered.every(el => state.selectedElements.has(el.id));
    document.getElementById('select-all-checkbox').checked = filtered.length > 0 && allFilteredChecked;
}

// Get filtered list based on category and search query
function getFilteredElements() {
    return state.elements.filter(el => {
        // Category check
        if (state.categoryFilter !== 'all' && el.type !== state.categoryFilter) {
            return false;
        }
        
        // Search query check
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            const tagMatch = el.tag.toLowerCase().includes(query);
            const typeMatch = el.type.toLowerCase().includes(query);
            const nameMatch = el.customName.toLowerCase().includes(query);
            const textMatch = el.text && el.text.toLowerCase().includes(query);
            const idAttrMatch = el.attributes.id && el.attributes.id.toLowerCase().includes(query);
            
            return tagMatch || typeMatch || nameMatch || textMatch || idAttrMatch;
        }
        
        return true;
    });
}

// Toggle element category filter
function filterCategory(category) {
    state.categoryFilter = category;
    
    // Style active pills
    document.querySelectorAll('.stat-pill').forEach(pill => pill.classList.remove('active'));
    const activePill = document.getElementById(`stat-${category}-pill`);
    if (activePill) activePill.classList.add('active');
    
    renderElementsList();
}

// Search filter
function filterElements() {
    const input = document.getElementById('element-search');
    state.searchQuery = input.value.trim();
    renderElementsList();
}

// Bulk Selection
function toggleSelectAll(checkbox) {
    const filtered = getFilteredElements();
    filtered.forEach(el => {
        if (checkbox.checked) {
            state.selectedElements.add(el.id);
        } else {
            state.selectedElements.delete(el.id);
        }
    });
    
    renderElementsList();
    generateCode();
}

// Single element selection toggling
function toggleElementSelection(id, checked) {
    if (checked) {
        state.selectedElements.add(id);
    } else {
        state.selectedElements.delete(id);
    }
    
    // Sync list check
    renderElementsList();
    // Update code POM preview
    generateCode();
}

// Select an element to inspect details
function selectElement(id) {
    state.activeElementId = id;
    
    // Update active highlight classes in elements explorer
    document.querySelectorAll('.element-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('data-id') === id) {
            card.classList.add('active');
        }
    });
    
    const el = state.elements.find(e => e.id === id);
    if (!el) return;
    
    // Hide empty state, reveal inspector pane
    document.getElementById('empty-inspector').style.display = 'none';
    document.getElementById('active-inspector').style.display = 'flex';
    
    // Render details
    document.getElementById('inspect-tag').innerText = el.tag;
    document.getElementById('inspect-type').innerText = el.type;
    
    const nameInput = document.getElementById('inspect-var-name');
    nameInput.value = el.customName;
    
    // Highlight quick format active chip if applicable
    updateQuickCasingChips(el.customName, el.type);
    
    // Collapsible snippet html
    const snippetCode = document.querySelector('#inspect-html-snippet code');
    snippetCode.innerText = el.fullHtml;
    
    // Render Locators Table
    renderLocatorsTable(el);
    
    // Sync highlight visually in Visual Sandbox iframe
    syncVisualSandboxHighlight(el);
}

// Reset inspector pane to empty state
function resetInspector() {
    document.getElementById('empty-inspector').style.display = 'flex';
    document.getElementById('active-inspector').style.display = 'none';
}

// HTML block collapsible toggle
let isHtmlSnippetCollapsed = true;
function toggleHtmlSnippet() {
    const box = document.getElementById('inspect-html-snippet');
    const icon = document.getElementById('html-toggle-icon');
    
    isHtmlSnippetCollapsed = !isHtmlSnippetCollapsed;
    if (isHtmlSnippetCollapsed) {
        box.classList.remove('open');
        icon.classList.remove('open');
    } else {
        box.classList.add('open');
        icon.classList.add('open');
    }
}

// Update Active Casing Chip Styles
function updateQuickCasingChips(name, type) {
    document.querySelectorAll('.casing-chip').forEach(chip => chip.classList.remove('active'));
    
    // Determine which casing is currently matched
    const el = state.elements.find(e => e.id === state.activeElementId);
    if (!el) return;
    
    if (name === el.names.camelCase) {
        document.querySelector('.casing-chip:nth-of-type(1)').classList.add('active');
    } else if (name === el.names.snake_case) {
        document.querySelector('.casing-chip:nth-of-type(2)').classList.add('active');
    } else if (name === el.names.PascalCase) {
        document.querySelector('.casing-chip:nth-of-type(3)').classList.add('active');
    }
}

// Real-time rename custom variable
function updateElementName(newName) {
    if (!state.activeElementId) return;
    
    const el = state.elements.find(e => e.id === state.activeElementId);
    if (!el) return;
    
    el.customName = newName.trim();
    
    // Sync item text in explorer tree list
    const card = document.querySelector(`.element-card[data-id="${el.id}"]`);
    if (card) {
        card.querySelector('.card-title-text').innerText = el.customName;
        card.querySelector('.card-title-text').title = el.customName;
    }
    
    // Sync code exporter
    generateCode();
    updateQuickCasingChips(el.customName, el.type);
}

// Format name using standard quick chips
function applyQuickCasing(casingType) {
    const el = state.elements.find(e => e.id === state.activeElementId);
    if (!el) return;
    
    const formatted = el.names[casingType];
    if (formatted) {
        document.getElementById('inspect-var-name').value = formatted;
        updateElementName(formatted);
    }
}

// Handle global casing modifications
function changeGlobalCasing(casingVal) {
    state.currentCasing = casingVal;
    
    // Apply casing format to all elements
    state.elements = state.elements.map(el => ({
        ...el,
        customName: el.names[casingVal]
    }));
    
    // Re-render Explorer lists
    renderElementsList();
    
    // Re-load inspector if active
    if (state.activeElementId) {
        selectElement(state.activeElementId);
    }
    
    // Rebuild POM code output
    generateCode();
}

// Renders the Locator Table rows
function renderLocatorsTable(el) {
    const tbody = document.getElementById('locators-tbody');
    tbody.innerHTML = '';
    
    el.locators.forEach((loc, index) => {
        const isChecked = loc.type === el.primaryLocatorType && loc.value === el.primaryLocatorValue;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align: center; vertical-align: middle;">
                <label class="radio-container">
                    <input type="radio" name="primary-locator" ${isChecked ? 'checked' : ''} onchange="setPrimaryLocator('${el.id}', ${index})" />
                    <span class="radio-checkmark"></span>
                </label>
            </td>
            <td>
                <span class="locator-strategy-badge">${loc.type}</span>
            </td>
            <td class="locator-value-cell">${escapeHtml(loc.value)}</td>
            <td style="text-align: center;">
                <button class="row-copy-btn" onclick="copyText(\`${loc.value}\`, 'Selector copied!')" title="Copy Selector">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Set standard primary selector path
function setPrimaryLocator(elementId, locatorIndex) {
    const el = state.elements.find(e => e.id === elementId);
    if (!el) return;
    
    const loc = el.locators[locatorIndex];
    if (loc) {
        el.primaryLocatorType = loc.type;
        el.primaryLocatorValue = loc.value;
    }
    
    // Regenerate code object in view
    generateCode();
}

// Helper to escape HTML tags in strings
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// CODE POM GENERATORS
// ==========================================
function generateCode() {
    // Sync active framework from dropdown
    const fwSelect = document.getElementById('framework-select');
    if (fwSelect) state.currentFramework = fwSelect.value;

    const activeSelected = state.elements.filter(el => state.selectedElements.has(el.id));
    const className = document.getElementById('class-name-input').value.trim() || 'LoginPage';
    
    let generatedCode = '';
    let ext = 'ts';
    
    switch (state.currentFramework) {
        case 'playwright_ts':
            generatedCode = compilePlaywrightTS(activeSelected, className);
            ext = 'ts';
            break;
        case 'playwright_py':
            generatedCode = compilePlaywrightPy(activeSelected, className);
            ext = 'py';
            break;
        case 'selenium_java':
            generatedCode = compileSeleniumJava(activeSelected, className);
            ext = 'java';
            break;
        case 'selenium_py':
            generatedCode = compileSeleniumPy(activeSelected, className);
            ext = 'py';
            break;
        case 'cypress_js':
            generatedCode = compileCypressJS(activeSelected, className);
            ext = 'js';
            break;
        case 'robot_fw':
            generatedCode = compileRobotFW(activeSelected);
            ext = 'resource';
            break;
    }
    
    // Update code output
    document.getElementById('code-output').innerText = generatedCode;
    
    // Update filename display
    document.getElementById('output-filename').innerText = `${className}.${ext}`;
}

function compilePlaywrightTS(elements, className) {
    let fields = '';
    let methods = '';
    
    elements.forEach(el => {
        // Find locator structure matching the primary locator type
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        const pwString = loc.frameworks.Playwright;
        
        fields += `    readonly ${el.customName}: Locator;\n`;
        methods += `        this.${el.customName} = ${pwString};\n`;
    });
    
    return `import { Page, Locator } from '@playwright/test';

export class ${className} {
    readonly page: Page;
${fields}
    constructor(page: Page) {
        this.page = page;
${methods}    }
}
`;
}

function compilePlaywrightPy(elements, className) {
    let initBody = '';
    
    elements.forEach(el => {
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        const pwString = loc.frameworks.Playwright;
        
        // Playwright Python uses page.locator instead of page.get_by... natively sometimes,
        // but if it's pw role, we translate or keep it.
        // We will adapt the string to python syntax (replace single quotes/NAs)
        let pyLocator = pwString
            .replace(/page\.get_by_role\("(\w+)"(?:,\s*name="([^"]+)")?\)/g, (match, role, name) => {
                return name ? `page.get_by_role("${role}", name="${name}")` : `page.get_by_role("${role}")`;
            })
            .replace(/page\.locator\('([^']+)'\)/g, 'page.locator("$1")');
            
        initBody += `        self.${el.customName} = ${pyLocator}\n`;
    });
    
    if (!initBody) initBody = "        pass\n";
    
    return `from playwright.sync_api import Page

class ${className}:
    def __init__(self, page: Page):
        self.page = page;
${initBody}`;
}

function compileSeleniumJava(elements, className) {
    let findBys = '';
    
    elements.forEach(el => {
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        let selString = loc.frameworks.Selenium;
        
        if (selString === 'N/A (Playwright Specific)') {
            // fallback to unique css or xpath
            const fb = el.locators.find(l => l.type === 'Unique CSS') || el.locators.find(l => l.type === 'Relative XPath');
            selString = fb ? fb.frameworks.Selenium : `By.cssSelector("button")`;
        }
        
        // Translate By.id("val") into FindBy properties
        let findByAnnotation = '';
        if (selString.startsWith('By.id(')) {
            findByAnnotation = `@FindBy(id = ${selString.substring(6, selString.length - 1)})`;
        } else if (selString.startsWith('By.name(')) {
            findByAnnotation = `@FindBy(name = ${selString.substring(8, selString.length - 1)})`;
        } else if (selString.startsWith('By.cssSelector(')) {
            findByAnnotation = `@FindBy(css = ${selString.substring(15, selString.length - 1)})`;
        } else if (selString.startsWith('By.xpath(')) {
            findByAnnotation = `@FindBy(xpath = ${selString.substring(9, selString.length - 1)})`;
        } else {
            findByAnnotation = `@FindBy(css = "/* Add selector */")`;
        }
        
        findBys += `    ${findByAnnotation}\n    private WebElement ${el.customName};\n\n`;
    });
    
    return `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class ${className} {
    private WebDriver driver;

${findBys}    public ${className}(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }
}
`;
}

function compileSeleniumPy(elements, className) {
    let locatorsTuple = '';
    let initBody = '';
    
    elements.forEach(el => {
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        let selString = loc.frameworks.Selenium;
        
        if (selString === 'N/A (Playwright Specific)') {
            const fb = el.locators.find(l => l.type === 'Unique CSS') || el.locators.find(l => l.type === 'Relative XPath');
            selString = fb ? fb.frameworks.Selenium : `By.cssSelector("button")`;
        }
        
        // Format of Selenium python: self.username_input = (By.ID, "username")
        // Translate: By.cssSelector("[name='fullname']") -> By.CSS_SELECTOR, "[name='fullname']"
        let pyTuple = '';
        if (selString.startsWith('By.id(')) {
            pyTuple = `(By.ID, ${selString.substring(6, selString.length - 1)})`;
        } else if (selString.startsWith('By.name(')) {
            pyTuple = `(By.NAME, ${selString.substring(8, selString.length - 1)})`;
        } else if (selString.startsWith('By.cssSelector(')) {
            pyTuple = `(By.CSS_SELECTOR, ${selString.substring(15, selString.length - 1)})`;
        } else if (selString.startsWith('By.xpath(')) {
            pyTuple = `(By.XPATH, ${selString.substring(9, selString.length - 1)})`;
        } else {
            pyTuple = `(By.CSS_SELECTOR, "")`;
        }
        
        initBody += `        self.${el.customName} = ${pyTuple}\n`;
    });
    
    if (!initBody) initBody = "        pass\n";
    
    return `from selenium.webdriver.common.by import By

class ${className}:
    def __init__(self, driver):
        self.driver = driver
${initBody}`;
}

function compileCypressJS(elements, className) {
    let getters = '';
    
    elements.forEach(el => {
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        let cyString = loc.frameworks.Cypress;
        
        if (cyString === 'N/A (Playwright Specific)') {
            const fb = el.locators.find(l => l.type === 'Unique CSS') || el.locators.find(l => l.type === 'Relative XPath');
            cyString = fb ? fb.frameworks.Cypress : `cy.get("button")`;
        }
        
        getters += `    get ${el.customName}() {\n        return ${cyString};\n    }\n\n`;
    });
    
    return `class ${className} {
${getters}}

export default new ${className}();
`;
}

function compileRobotFW(elements) {
    let variables = '';
    
    elements.forEach(el => {
        const loc = el.locators.find(l => l.type === el.primaryLocatorType) || el.locators[0];
        let rbString = loc.frameworks.Robot;
        
        if (rbString === 'N/A (Playwright Specific)') {
            const fb = el.locators.find(l => l.type === 'Unique CSS') || el.locators.find(l => l.type === 'Relative XPath');
            rbString = fb ? fb.frameworks.Robot : `css=button`;
        }
        
        // Robot framework variables:
        // ${USER_NAME_INPUT}    id=username
        const rbName = el.customName.toUpperCase();
        variables += `\${${rbName}}    ${rbString}\n`;
    });
    
    return `*** Variables ***
${variables}`;
}

// Copy Exporter Page Object code to clipboard
function copyGeneratedCode() {
    const code = document.getElementById('code-output').innerText;
    if (!code) return;
    
    copyText(code, 'Page Object code copied to clipboard!');
}

// Trigger browser download of custom Page Object class file
function downloadPageObjectFile() {
    const code = document.getElementById('code-output').innerText;
    if (!code) return;
    
    const className = document.getElementById('class-name-input').value.trim() || 'LoginPage';
    
    let ext = 'ts';
    switch (state.currentFramework) {
        case 'playwright_ts': ext = 'ts'; break;
        case 'playwright_py': ext = 'py'; break;
        case 'selenium_java': ext = 'java'; break;
        case 'selenium_py': ext = 'py'; break;
        case 'cypress_js': ext = 'js'; break;
        case 'robot_fw': ext = 'resource'; break;
    }
    
    const filename = `${className}.${ext}`;
    
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    
    showToast(`Downloaded ${filename} successfully!`, 'success');
}

// ==========================================
// INTERACTIVE VISUAL PREVIEW SANDBOX
// ==========================================
let isVisualPreviewOpen = false;

function toggleVisualPreviewDrawer() {
    const drawer = document.getElementById('preview-drawer');
    const btn = document.getElementById('preview-drawer-btn');
    
    isVisualPreviewOpen = !isVisualPreviewOpen;
    if (isVisualPreviewOpen) {
        drawer.classList.add('open');
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Hide Sandbox View`;
    } else {
        drawer.classList.remove('open');
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> Show Live Web Sandbox View`;
    }
}

// Initialize Visual Sandbox inside Iframe
function initSandboxFrame() {
    const iframe = document.getElementById('sandbox-iframe');
    if (!iframe || !state.rawHtml) return;
    
    // Inject Custom Styles and Hover/Click Event Capture Javascript into user's raw HTML
    // Styles highlight matching tags under cursor.
    const customStyles = `
        <style>
            /* Visual Bounding Outlines */
            .autolocator-hovered {
                outline: 2px dashed #8a2be2 !important;
                outline-offset: 1px !important;
                box-shadow: 0 0 8px rgba(138, 43, 226, 0.6) !important;
                cursor: crosshair !important;
            }
            .autolocator-selected {
                outline: 3px solid #00f2fe !important;
                outline-offset: 1px !important;
                box-shadow: 0 0 12px rgba(0, 242, 254, 0.8) !important;
            }
        </style>
    `;
    
    const customScript = `
        <script>
            // Bounding scripts running inside iframe sandboxing
            document.addEventListener('DOMContentLoaded', () => {
                const targetTags = ['input', 'button', 'textarea', 'select', 'a', 'form'];
                
                // Track element indexes matching backend order
                // Gather elements in identical BeautifulSoup structure
                let allElements = [];
                
                const candidates = Array.from(document.querySelectorAll('input, button, textarea, select, a, form'));
                
                // Add non-standard elements with interactive roles/testids
                const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox'];
                const customElements = Array.from(document.querySelectorAll('*')).filter(el => {
                    const name = el.tagName.toLowerCase();
                    return !targetTags.includes(name) && (
                        interactiveRoles.includes(el.getAttribute('role')) ||
                        el.getAttribute('data-testid') ||
                        el.getAttribute('data-cy') ||
                        el.getAttribute('data-qa') ||
                        el.getAttribute('onclick')
                    );
                });
                
                const rawElements = candidates.concat(customElements);
                
                // Filter hidden inputs
                allElements = rawElements.filter(el => {
                    return !(el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'hidden');
                });
                
                // Attach visual handlers
                allElements.forEach((el, index) => {
                    // Store internal ID
                    el.setAttribute('data-autolocator-index', index);
                    
                    el.addEventListener('mouseover', (e) => {
                        e.stopPropagation();
                        // clear other hovers
                        document.querySelectorAll('.autolocator-hovered').forEach(node => node.classList.remove('autolocator-hovered'));
                        el.classList.add('autolocator-hovered');
                    });
                    
                    el.addEventListener('mouseout', (e) => {
                        el.classList.remove('autolocator-hovered');
                    });
                    
                    el.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Clear selected highlights
                        document.querySelectorAll('.autolocator-selected').forEach(node => node.classList.remove('autolocator-selected'));
                        el.classList.add('autolocator-selected');
                        
                        // Post message back to parent client window!
                        window.parent.postMessage({
                            type: 'ELEMENT_CLICKED',
                            index: index
                        }, '*');
                    });
                });
            });
        </script>
    `;
    
    // Inject scripts directly before closing head or closing body
    let finalHtml = state.rawHtml;
    if (finalHtml.includes('</head>')) {
        finalHtml = finalHtml.replace('</head>', `${customStyles}</head>`);
    } else {
        finalHtml = customStyles + finalHtml;
    }
    
    if (finalHtml.includes('</body>')) {
        finalHtml = finalHtml.replace('</body>', `${customScript}</body>`);
    } else {
        finalHtml = finalHtml + customScript;
    }
    
    iframe.srcdoc = finalHtml;
}

// Receive messages from visual preview sandbox
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ELEMENT_CLICKED') {
        const index = event.data.index;
        // The index in backend matches elements array index!
        if (state.elements[index]) {
            const elId = state.elements[index].id;
            selectElement(elId);
            
            // Auto scroll elements explorer list to show selected element card
            const card = document.querySelector(`.element-card[data-id="${elId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
});

// Update highlight outline inside sandboxed frame
function syncVisualSandboxHighlight(el) {
    const iframe = document.getElementById('sandbox-iframe');
    if (!iframe || !iframe.contentWindow) return;
    
    // Find index of element in state
    const index = state.elements.findIndex(e => e.id === el.id);
    if (index === -1) return;
    
    // Inject script into iframe window context to select element by custom attribute index
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc) {
            // Remove previous highlights
            doc.querySelectorAll('.autolocator-selected').forEach(node => node.classList.remove('autolocator-selected'));
            
            // Select and highlight matching element
            const node = doc.querySelector(`[data-autolocator-index="${index}"]`);
            if (node) {
                node.classList.add('autolocator-selected');
                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    } catch (e) {
        // Handle potential cross-origin access blocks if iframe fails to load or acts blocky
        console.warn('Iframe sync failed:', e);
    }
}

// ==========================================
// TOAST NOTIFICATIONS & CLIPBOARD
// ==========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.innerText = message;
    toast.className = `toast show ${type}`;
    
    // Add checkmark icon for success
    if (type === 'success') {
        toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-success);"></i> ` + message;
    } else if (type === 'error') {
        toast.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color: var(--color-error);"></i> ` + message;
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

function copyText(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
    }).catch(err => {
        showToast('Clipboard write failed!', 'error');
        console.error(err);
    });
}
