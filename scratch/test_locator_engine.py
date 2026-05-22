import sys
import os

# Append parent directory to path so we can import locator_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from locator_engine import LocatorEngine

def run_test():
    sample_html = """
    <!DOCTYPE html>
    <html>
    <head><title>Test Signup Form</title></head>
    <body>
        <div class="container">
            <h1>Create Account</h1>
            <form id="signup-form" action="/register" method="POST">
                <div class="form-group">
                    <label for="usr-name">Full Name *:</label>
                    <input type="text" id="usr-name" name="fullname" placeholder="John Doe" required />
                </div>
                
                <div class="form-group">
                    <label>
                        Email Address:
                        <input type="email" name="email_addr" placeholder="you@example.com" />
                    </label>
                </div>
                
                <div class="form-group">
                    <label for="pass-field">Password:</label>
                    <input type="password" id="pass-field" class="form-control" />
                </div>
                
                <div class="form-group">
                    <input type="checkbox" id="agree" name="agree_to_terms" />
                    <label for="agree">I agree to the <a href="/terms">Terms of Service</a></label>
                </div>

                <div class="form-group">
                    <select id="country-select">
                        <option value="us">United States</option>
                        <option value="ca">Canada</option>
                    </select>
                </div>
                
                <div class="form-actions">
                    <button type="submit" data-testid="submit-btn" class="btn btn-primary">Sign Up Now</button>
                    <a href="/login" class="login-link">Already have an account? Sign In</a>
                </div>
            </form>
        </div>
    </body>
    </html>
    """
    
    print("Initializing Locator Engine...")
    engine = LocatorEngine(sample_html)
    
    print(f"\nExtracted {len(engine.elements)} elements:")
    for el in engine.elements:
        print("="*60)
        print(f"Tag: <{el['tag']}> | Type: {el['type']}")
        print(f"Computed Names:")
        print(f"  camelCase : {el['names']['camelCase']}")
        print(f"  snake_case: {el['names']['snake_case']}")
        print(f"  PascalCase: {el['names']['PascalCase']}")
        print("\nPrimary Locators:")
        for loc in el['locators'][:3]:  # Print top 3 locators
            print(f"  [{loc['type']}] (Score: {loc['score']}): {loc['value']}")
            print(f"    Playwright: {loc['frameworks']['Playwright']}")
        print("="*60)

if __name__ == "__main__":
    run_test()
