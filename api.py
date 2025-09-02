from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import subprocess
import os
import sys
import json
import re

app = FastAPI(
    title="Bolagsplatsen Scraper API",
    description="Live scraping API for Bolagsplatsen business listings",
    version="1.0.0"
)

def translate_text(text):
    """Translate Swedish text to English (simplified)"""
    if not text:
        return text
    
    # Simple Swedish to English translations for common business terms
    translations = {
        'företag': 'company',
        'till salu': 'for sale',
        'omsättning': 'revenue',
        'resultat': 'profit',
        'anställda': 'employees',
        'prisidé': 'asking price',
        'mkr': 'MSEK',
        'sek': 'SEK',
        'kr': 'SEK'
    }
    
    translated = text
    for swedish, english in translations.items():
        translated = translated.replace(swedish, english)
    
    return translated

def convert_currency(price_str):
    """Convert SEK prices to USD (simplified)"""
    if not price_str:
        return "$0"
    
    # Extract numbers from price string
    numbers = re.findall(r'[\d,]+', price_str)
    if numbers:
        try:
            # Convert SEK to USD (approximate rate: 1 SEK = 0.1 USD)
            sek_amount = float(numbers[0].replace(',', '.'))
            usd_amount = sek_amount * 0.1
            return f"${usd_amount:.0f}"
        except ValueError:
            pass
    
    return price_str

def run_scraper():
    """Run the Scrapy spider and return fresh live data"""
    try:
        print("🔄 Starting live scraping from Bolagsplatsen...")
        
        # Always run the scraper to get fresh data
        cmd = [sys.executable, "start_scraper.py"] if os.path.exists("start_scraper.py") else ["scrapy", "crawl", "bolagsplatsen"]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=os.getcwd()  # Use current working directory instead of hardcoded path
        )
        
        if result.returncode == 0:
            print("✅ Scraper completed successfully")
            
            # Load the fresh scraped data
            if os.path.exists("bolagsplatsen_listings.json"):
                with open("bolagsplatsen_listings.json", "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    print(f"📊 Loaded {len(raw_data)} fresh listings from live scraping")
            else:
                print("❌ No output file created by scraper")
                return None
        else:
            print(f"❌ Scraper failed: {result.stderr}")
            return None
        
        if not raw_data:
            return None
        
        # Transform the data to match the expected format with translation and USD conversion
        transformed_data = []
        for item in raw_data:
            # Create details sections from the scraped data
            details_sections = []
            
            # Add business description section (use full description if available)
            description_text = item.get('full_description') or item.get('description', '')
            if description_text:
                details_sections.append({
                    "infoSummary": "Business Description",
                    "infoItems": [translate_text(description_text)]
                })
            
            # Add structured content sections if available
            if item.get('structured_content'):
                structured_content = item.get('structured_content', {})
                for section_key, section_content in structured_content.items():
                    if section_content and len(str(section_content).strip()) > 20:
                        # Translate section names
                        section_names = {
                            'company_brief': 'Company Overview',
                            'potential': 'Growth Potential',
                            'reason_for_sale': 'Reason for Sale',
                            'price_idea': 'Pricing Details',
                            'summary': 'Summary',
                            'description': 'Description',
                            'business_activity': 'Business Activity',
                            'market': 'Market Information',
                            'competition': 'Competitive Situation'
                        }
                        
                        section_title = section_names.get(section_key, section_key.replace('_', ' ').title())
                        details_sections.append({
                            "infoSummary": section_title,
                            "infoItems": [translate_text(str(section_content))]
                        })
            
            # Add financial metrics section
            financial_items = []
            if item.get('revenue'):
                financial_items.append(f"Revenue: {translate_text(item.get('revenue', ''))}")
            if item.get('detailed_revenue'):
                financial_items.append(f"Detailed Revenue: {translate_text(item.get('detailed_revenue', ''))}")
            if item.get('profit_status'):
                financial_items.append(f"Profit Status: {translate_text(item.get('profit_status', ''))}")
            if item.get('detailed_profit'):
                financial_items.append(f"Detailed Profit: {translate_text(item.get('detailed_profit', ''))}")
            if item.get('price'):
                financial_items.append(f"Asking Price: {convert_currency(item.get('price', ''))}")
            
            # Add additional financial details
            if item.get('financial_details'):
                for detail in item.get('financial_details', []):
                    financial_items.append(translate_text(detail))
            
            if financial_items:
                details_sections.append({
                    "infoSummary": "Financial Information",
                    "infoItems": financial_items
                })
            
            # Add business metrics section
            business_items = []
            if item.get('employee_count'):
                business_items.append(f"Employees: {translate_text(item.get('employee_count', ''))}")
            
            if business_items:
                details_sections.append({
                    "infoSummary": "Business Metrics",
                    "infoItems": business_items
                })
            
            # Add contact information section
            contact_items = []
            if item.get('phone'):
                contact_items.append(f"Phone: {item.get('phone', '')}")
            if item.get('email'):
                contact_items.append(f"Email: {item.get('email', '')}")
            if item.get('broker_name'):
                contact_items.append(f"Broker: {translate_text(item.get('broker_name', ''))}")
            if item.get('broker_company'):
                contact_items.append(f"Broker Company: {translate_text(item.get('broker_company', ''))}")
            
            if contact_items:
                details_sections.append({
                    "infoSummary": "Contact Information",
                    "infoItems": contact_items
                })
            
            # Create the transformed item
            transformed_item = {
                "title": item.get("title", ""),
                "company": item.get("title", ""),  # Use title as company name
                "location": item.get("location", ""),
                "price": convert_currency(item.get("price", "")),
                "category": item.get("category", ""),
                "industry": item.get("category", ""),  # Use category as industry
                "link": item.get("url", ""),
                "details": details_sections,
                "business_name": item.get("title", ""),
                "contact_name": item.get("broker_name", ""),
                "phone_number": item.get("phone", "")
            }
            
            transformed_data.append(transformed_item)
        
        return transformed_data
        
    except Exception as e:
        print(f"Error in run_scraper: {e}")
        return None

@app.get("/")
async def root():
    """Root endpoint - redirects to health check"""
    return {"message": "Bolagsplatsen Scraper API", "health": "/health", "scrap": "/scrap"}

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "Bolagsplatsen Scraper API",
        "version": "1.0.0",
        "timestamp": "2025-09-02T13:00:00Z"
    }

@app.get("/scrap")
async def scrap_endpoint():
    """Main endpoint that triggers live scraping and returns fresh data"""
    try:
        data = run_scraper()
        if data:
            return {
                "success": True,
                "message": f"Successfully scraped {len(data)} business listings",
                "count": len(data),
                "data": data
            }
        else:
            raise HTTPException(status_code=500, detail="No data available or scraping failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
