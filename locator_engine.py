import re
from bs4 import BeautifulSoup, Tag

class LocatorEngine:
    def __init__(self, html_content: str):
        self.soup = BeautifulSoup(html_content, 'html.parser')
        self.elements = []
        self._analyze()

    def _analyze(self):
        # Scan for all candidate elements
        # 1. Inputs, textareas, selects
        # 2. Buttons (button, input[type=submit/button/image])
        # 3. Links (a)
        # 4. Forms
        # 5. Elements with role="button/link/textbox/checkbox/radio"
        # 6. Elements with data-testid, data-cy, data-qa
        
        candidates = self.soup.find_all(['input', 'button', 'textarea', 'select', 'a', 'form'])
        
        # Add elements with interactive roles or custom test-ids
        interactive_roles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox']
        custom_elements = self.soup.find_all(lambda tag: tag.name not in ['input', 'button', 'textarea', 'select', 'a', 'form'] and (
            tag.get('role') in interactive_roles or 
            tag.get('data-testid') or 
            tag.get('data-cy') or 
            tag.get('data-qa') or
            tag.get('onclick')
        ))
        
        all_tags = candidates + custom_elements
        
        # Keep track of processed elements to avoid duplicates (e.g. if parsed twice)
        seen_ids = set()
        
        for index, tag in enumerate(all_tags):
            # Generate a unique internal ID for UI tracking
            tag_id = id(tag)
            if tag_id in seen_ids:
                continue
            seen_ids.add(tag_id)
            
            # Skip hidden elements (e.g., input type="hidden")
            if tag.name == 'input' and tag.get('type') == 'hidden':
                continue
                
            element_info = self._process_element(tag, index + 1)
            if element_info:
                self.elements.append(element_info)

    def _process_element(self, tag: Tag, index: int) -> dict:
        tag_name = tag.name
        el_type = self._determine_element_type(tag)
        
        # Original outer HTML (truncated for preview if needed, but return full for backend)
        outer_html = str(tag)
        inner_text = tag.get_text(strip=True)
        
        # Extract attributes
        attrs = {k: v for k, v in tag.attrs.items()}
        
        # Find associated label text if applicable
        label_text = self._find_associated_label(tag)
        
        # Generate clean names in multiple Casing formats
        base_name = self._generate_base_name(tag, el_type, label_text, inner_text)
        names = {
            'camelCase': self._to_casing(base_name, el_type, 'camelCase'),
            'snake_case': self._to_casing(base_name, el_type, 'snake_case'),
            'PascalCase': self._to_casing(base_name, el_type, 'PascalCase')
        }
        
        # Generate locator strategies
        locators = self._generate_locators(tag)
        
        return {
            'id': f"el_{index}",
            'tag': tag_name,
            'type': el_type,
            'names': names,
            'defaultName': names['camelCase'],
            'locators': locators,
            'htmlSnippet': outer_html[:400] + ('...' if len(outer_html) > 400 else ''),
            'fullHtml': outer_html,
            'text': inner_text[:100],
            'attributes': attrs
        }

    def _determine_element_type(self, tag: Tag) -> str:
        name = tag.name
        if name == 'button':
            return 'button'
        elif name == 'input':
            t = tag.get('type', 'text').lower()
            if t in ['submit', 'button', 'image']:
                return 'button'
            elif t == 'checkbox':
                return 'checkbox'
            elif t == 'radio':
                return 'radio'
            elif t == 'file':
                return 'file'
            else:
                return 'input'
        elif name == 'textarea':
            return 'input'
        elif name == 'select':
            return 'select'
        elif name == 'a':
            return 'link'
        elif name == 'form':
            return 'form'
        else:
            role = tag.get('role', '').lower()
            if role in ['button', 'link', 'checkbox', 'radio']:
                return role
            if tag.get('onclick'):
                return 'button'
            return 'other'

    def _find_associated_label(self, tag: Tag) -> str:
        # If element has ID, search for <label for="id">
        el_id = tag.get('id')
        if el_id:
            label = self.soup.find('label', attrs={'for': el_id})
            if label:
                return label.get_text(strip=True)
                
        # Search for parent <label> wrapper
        parent = tag.parent
        while parent:
            if parent.name == 'label':
                # Get label text but exclude the tag's own text if nested
                label_soup = BeautifulSoup(str(parent), 'html.parser')
                # Remove the nested input/select/textarea to get clean text
                nested = label_soup.find([tag.name])
                if nested:
                    nested.decompose()
                return label_soup.get_text(strip=True)
            parent = parent.parent
            
        return ''

    def _generate_base_name(self, tag: Tag, el_type: str, label_text: str, inner_text: str) -> str:
        # Priority order for name generation:
        # 1. Label Text
        # 2. Aria-label / Aria-labelledby
        # 3. Placeholder Text
        # 4. ID / Name
        # 5. Text content (for buttons, links, etc.)
        # 6. Title / Alt text
        # 7. Fallback
        
        candidates = []
        
        if label_text:
            candidates.append(label_text)
            
        aria_label = tag.get('aria-label')
        if aria_label:
            candidates.append(aria_label)
            
        placeholder = tag.get('placeholder')
        if placeholder:
            candidates.append(placeholder)
            
        name_attr = tag.get('name')
        if name_attr:
            candidates.append(name_attr)
            
        id_attr = tag.get('id')
        if id_attr and not self._is_dynamic_id(id_attr):
            candidates.append(id_attr)
            
        # Text content if short and meaningful
        if inner_text and len(inner_text) < 40 and el_type in ['button', 'link']:
            candidates.append(inner_text)
            
        title = tag.get('title')
        if title:
            candidates.append(title)
            
        alt = tag.get('alt')
        if alt:
            candidates.append(alt)
            
        # Clean candidates and pick the first non-empty one
        for cand in candidates:
            cleaned = self._clean_string(str(cand))
            if cleaned:
                return cleaned
                
        # Fallback to tag name + type
        return f"{tag.name}_{el_type}"

    def _clean_string(self, text: str) -> str:
        # Replace non-alphanumeric with spaces, keep alphanumeric
        # E.g. "Email Address*:" -> "Email Address"
        cleaned = re.sub(r'[^a-zA-Z0-9\s_-]', ' ', text)
        # Standardize spaces
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned

    def _is_dynamic_id(self, id_val: str) -> bool:
        if not id_val:
            return True
        # Check patterns matching typical framework-generated or database IDs:
        # - Ends in a long digit sequence (e.g. element-124915)
        # - Looks like hex hash (e.g. 5f3a9e)
        # - Framework prefixes: ember, j_idt, ext-gen, react-, angular-, etc.
        if re.search(r'\d{4,}$', id_val):
            return True
        if re.match(r'^(ember|j_idt|ext-gen|__|\:r\:|\:R\:)', id_val):
            return True
        if re.match(r'^[a-fA-F0-9]{8,12}$', id_val):
            return True
        return False

    def _to_casing(self, text: str, el_type: str, casing: str) -> str:
        # First split into words
        # Split by spaces, underscores, and hyphens, or camelCase transitions
        words = re.findall(r'[A-Za-z0-9]+', text)
        if not words:
            words = [el_type]
            
        # Standardize words to lowercase
        words = [w.lower() for w in words]
        
        # Suffix handling
        suffix_map = {
            'button': 'Button',
            'input': 'Input',
            'checkbox': 'Checkbox',
            'radio': 'Radio',
            'select': 'Select',
            'link': 'Link',
            'form': 'Form',
            'file': 'FileInput',
            'other': 'Element'
        }
        
        suffix = suffix_map.get(el_type, 'Element')
        
        # If suffix is already at the end of the text, don't double append
        last_word = words[-1]
        suffix_lower = suffix.lower()
        
        # Check if the last word is similar to the suffix
        if last_word in [suffix_lower, 'btn', 'lnk', 'chk', 'rad', 'txt', 'sel']:
            # We already have a suffix-like word, let's keep it or swap it
            # Remove the existing shorthand/suffix to standardize
            words.pop()
            
        if casing == 'camelCase':
            first = words[0]
            rest = [w.capitalize() for w in words[1:]]
            core = first + "".join(rest)
            return core + suffix
        elif casing == 'snake_case':
            core = "_".join(words)
            return f"{core}_{suffix.lower()}"
        elif casing == 'PascalCase':
            core = "".join([w.capitalize() for w in words])
            return core + suffix
        return text

    def _generate_locators(self, tag: Tag) -> list:
        locators = []
        
        # 1. Custom Test Attribute (highest industry standard)
        for attr in ['data-testid', 'data-cy', 'data-qa', 'data-target']:
            val = tag.get(attr)
            if val:
                locators.append({
                    'type': 'Data Attribute',
                    'value': f'[{attr}="{val}"]',
                    'frameworks': {
                        'Playwright': f'page.locator(\'[{attr}="{val}"]\')',
                        'Selenium': f'By.cssSelector("[{attr}=\'{val}\']")',
                        'Cypress': f'cy.get(\'[{attr}="{val}"]\')',
                        'Robot': f'css=[{attr}="{val}"]'
                    },
                    'score': 100
                })

        # 2. ID Selector
        el_id = tag.get('id')
        if el_id:
            is_dynamic = self._is_dynamic_id(el_id)
            score = 50 if is_dynamic else 95
            locators.append({
                'type': 'ID',
                'value': f'#{el_id}',
                'isDynamic': is_dynamic,
                'frameworks': {
                    'Playwright': f'page.locator(\'#{el_id}\')',
                    'Selenium': f'By.id("{el_id}")',
                    'Cypress': f'cy.get(\'#{el_id}\')',
                    'Robot': f'id={el_id}'
                },
                'score': score
            })

        # 3. Name Attribute
        name_attr = tag.get('name')
        if name_attr:
            locators.append({
                'type': 'Name',
                'value': f'[name="{name_attr}"]',
                'frameworks': {
                    'Playwright': f'page.locator(\'[name="{name_attr}"]\')',
                    'Selenium': f'By.name("{name_attr}")',
                    'Cypress': f'cy.get(\'[name="{name_attr}"]\')',
                    'Robot': f'name={name_attr}'
                },
                'score': 85
            })

        # 4. Text-based selectors (for buttons and links)
        inner_text = tag.get_text(strip=True)
        # Escaping quotes in text
        escaped_text = inner_text.replace("'", "\\'")
        if inner_text and len(inner_text) < 50:
            if tag.name == 'a':
                xpath_text = f"//a[contains(text(), '{escaped_text}')]"
                playwright_method = f'page.get_by_role("link", name="{escaped_text}")'
            elif tag.name == 'button' or (tag.name == 'input' and tag.get('type') in ['button', 'submit']):
                xpath_text = f"//button[text()='{escaped_text}']" if tag.name == 'button' else f"//input[@value='{escaped_text}']"
                playwright_method = f'page.get_by_role("button", name="{escaped_text}")'
            else:
                xpath_text = f"//*[text()='{escaped_text}']"
                playwright_method = f'page.get_by_text("{escaped_text}")'
                
            locators.append({
                'type': 'Text / XPath',
                'value': xpath_text,
                'frameworks': {
                    'Playwright': playwright_method,
                    'Selenium': f'By.xpath("{xpath_text}")',
                    'Cypress': f'cy.contains(\'{escaped_text}\')',
                    'Robot': f'xpath={xpath_text}'
                },
                'score': 80
            })

        # 5. Playwright Role (Advanced Semantics)
        pw_role = self._generate_playwright_role(tag)
        if pw_role:
            locators.append({
                'type': 'Playwright Role',
                'value': pw_role,
                'frameworks': {
                    'Playwright': pw_role,
                    'Selenium': 'N/A (Playwright Specific)',
                    'Cypress': 'N/A (Playwright Specific)',
                    'Robot': 'N/A (Playwright Specific)'
                },
                'score': 90
            })

        # 6. Type and Value Attributes
        t = tag.get('type')
        if t and tag.name == 'input' and t not in ['text', 'hidden']:
            locators.append({
                'type': 'CSS Attribute',
                'value': f'input[type="{t}"]',
                'frameworks': {
                    'Playwright': f'page.locator(\'input[type="{t}"]\')',
                    'Selenium': f'By.cssSelector("input[type=\'{t}\']")',
                    'Cypress': f'cy.get(\'input[type="{t}"]\')',
                    'Robot': f'css=input[type="{t}"]'
                },
                'score': 70
            })

        # 7. Unique CSS Selector (relative path using classes or DOM structure)
        css_path = self._generate_unique_css(tag)
        if css_path:
            locators.append({
                'type': 'Unique CSS',
                'value': css_path,
                'frameworks': {
                    'Playwright': f'page.locator(\'{css_path}\')',
                    'Selenium': f'By.cssSelector("{css_path}")',
                    'Cypress': f'cy.get(\'{css_path}\')',
                    'Robot': f'css={css_path}'
                },
                'score': 75
            })

        # 8. Hierarchical Relative XPath
        xpath = self._generate_relative_xpath(tag)
        if xpath:
            locators.append({
                'type': 'Relative XPath',
                'value': xpath,
                'frameworks': {
                    'Playwright': f'page.locator(\'xpath={xpath}\')',
                    'Selenium': f'By.xpath("{xpath}")',
                    'Cypress': f'cy.xpath(\'{xpath}\')',
                    'Robot': f'xpath={xpath}'
                },
                'score': 65
            })

        # Sort locators by quality score descending
        locators.sort(key=lambda x: x['score'], reverse=True)
        return locators

    def _generate_playwright_role(self, tag: Tag) -> str:
        # Formulate page.get_by_role calls based on standard ARIA roles
        name = tag.name
        t = tag.get('type', '').lower()
        role = tag.get('role')
        
        # Calculate accessible name candidate
        acc_name = tag.get('aria-label') or tag.get('placeholder') or tag.get('title')
        if not acc_name:
            if tag.name == 'input' and tag.get('type') == 'submit':
                acc_name = tag.get('value')
            else:
                acc_name = tag.get_text(strip=True)
                
        acc_name = acc_name.strip() if acc_name else ''
        acc_name = re.sub(r'\s+', ' ', acc_name) # normalize spaces
        
        pw_role = None
        if name == 'button' or role == 'button' or (name == 'input' and t in ['submit', 'button']):
            pw_role = 'button'
        elif name == 'a' or role == 'link':
            pw_role = 'link'
        elif name == 'input' and t == 'checkbox' or role == 'checkbox':
            pw_role = 'checkbox'
        elif name == 'input' and t == 'radio' or role == 'radio':
            pw_role = 'radio'
        elif name == 'select' or role == 'combobox':
            pw_role = 'combobox'
        elif name == 'textarea' or (name == 'input' and t in ['text', 'email', 'password', 'search', 'tel', 'url']):
            pw_role = 'textbox'
            
        if pw_role:
            if acc_name and len(acc_name) < 40:
                # Escape double quotes
                escaped_name = acc_name.replace('"', '\\"')
                return f'page.get_by_role("{pw_role}", name="{escaped_name}")'
            else:
                return f'page.get_by_role("{pw_role}")'
        return ''

    def _generate_unique_css(self, tag: Tag) -> str:
        # Walk up the tree up to 5 levels to construct a nice CSS path
        path = []
        current = tag
        
        for level in range(5):
            if not current or current.name == '[document]':
                break
                
            el_id = current.get('id')
            # If we find a solid, non-dynamic ID on current or ancestor, we stop there!
            if el_id and not self._is_dynamic_id(el_id):
                path.insert(0, f"#{el_id}")
                break
                
            # Otherwise use classes or tag name
            classes = current.get('class')
            # filter out dynamic-looking classes or tailwind utilities if possible, or just keep first class
            semantic_classes = []
            if classes:
                # standard check for tailwind/utility classes (e.g. p-4, m-2, flex, w-full, hover:bg-...)
                for c in classes:
                    if not re.match(r'^(p|m|w|h|x|y|t|b|l|r|bg|text|flex|grid|border|rounded|shadow|opacity|hover|focus|transition|duration)-', c) and len(c) > 2:
                        semantic_classes.append(c)
            
            selector = current.name
            if semantic_classes:
                selector += f".{semantic_classes[0]}"
            elif classes:
                selector += f".{classes[0]}"
                
            # If it's not unique among siblings, add nth-of-type
            siblings = current.parent.find_all(current.name, recursive=False) if current.parent else []
            if len(siblings) > 1:
                index = siblings.index(current) + 1
                selector += f":nth-of-type({index})"
                
            path.insert(0, selector)
            
            # If we've reached a form or the body, we can stop
            if current.name in ['form', 'body']:
                break
                
            current = current.parent
            
        return " > ".join(path)

    def _generate_relative_xpath(self, tag: Tag) -> str:
        path = []
        current = tag
        
        while current and current.name != '[document]':
            el_id = current.get('id')
            if el_id and not self._is_dynamic_id(el_id):
                path.insert(0, f"//*[@id='{el_id}']")
                break
                
            attr_selector = ""
            # Try some common attribute checks
            for attr in ['data-testid', 'name', 'type']:
                val = current.get(attr)
                if val:
                    attr_selector = f"[@{attr}='{val}']"
                    break
                    
            tag_name = current.name
            
            # Determine sibling index
            siblings = current.parent.find_all(tag_name, recursive=False) if current.parent else []
            if len(siblings) > 1:
                index = siblings.index(current) + 1
                path.insert(0, f"{tag_name}{attr_selector}[{index}]")
            else:
                path.insert(0, f"{tag_name}{attr_selector}")
                
            if current.name in ['body', 'form']:
                # Add leading relative symbol if we hit body/form and stop
                if current.name == 'form':
                    path.insert(0, "") # will create //form...
                break
                
            current = current.parent
            
        # Combine xpath
        xpath = "/".join(path)
        if not xpath.startswith("//"):
            xpath = "//" + xpath
        # Clean double slashes
        xpath = xpath.replace("///", "//").replace("//body/", "/body/")
        return xpath
