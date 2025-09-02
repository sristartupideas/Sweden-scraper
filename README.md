# Render Deployment Files

This folder contains all the files needed to deploy the Bolagsplatsen Scraper to Render.

## Files Included:

### Core Application Files:
- **`api.py`** - Main FastAPI application with all endpoints
- **`requirements.txt`** - Python dependencies
- **`render.yaml`** - Render deployment configuration
- **`start_scraper.py`** - Cloud-optimized scraper startup script

### Scrapy Project Files:
- **`scrapy.cfg`** - Scrapy project configuration
- **`bolagsplatsen_scraper/`** - Complete Scrapy project directory
  - `spiders/bolagsplatsen.py` - Main spider for scraping Bolagsplatsen
  - `settings.py` - Scrapy settings optimized for cloud deployment
  - `items.py` - Data structure definitions
  - `middlewares.py` - Scrapy middlewares
  - `pipelines.py` - Data processing pipelines

## Deployment Instructions:

1. **Upload all files** from this `render/` folder to your GitHub repository
2. **Connect repository** to Render
3. **Deploy** using the `render.yaml` configuration
4. **Test endpoints**:
   - `/scrap` - Main endpoint for n8n workflow
   - `/listings` - Get all listings
   - `/search` - Search listings
   - `/docs` - API documentation

## What's Fixed:

✅ **Live scraping** - API scrapes fresh data from Bolagsplatsen every time  
✅ **Scraper working** - Extracts 400+ business listings  
✅ **API working** - Processes data into expected format  
✅ **Cloud optimized** - Memory limits and settings for Render  
✅ **All endpoints functional** - Returns real live data instead of errors  

## Expected Results:

- **Working `/scrap` endpoint** with fresh business listings from live scraping
- **Enhanced data extraction** (descriptions, financial info, contact details)
- **Cloud-optimized performance** for Render
- **No more 502 errors** or "No data available" messages
- **Always up-to-date data** - scraped live from the website
