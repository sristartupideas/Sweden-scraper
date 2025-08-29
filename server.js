const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Swedish website configurations with broad selectors
const WEBSITES = {
  // PRIORITY 1: Exitpartner - A strong, reliable source.
  exitpartner: {
    baseUrl: 'https://www.exitpartner.se',
    listingUrl: 'https://www.exitpartner.se/foretag-till-salu/',
    pagination: '?page=',
    priority: 1,
    maxPages: 8
  },
  // PRIORITY 2: Bolagsplatsen - A large source that needs better extraction.
  bolagsplatsen: {
    baseUrl: 'https://www.bolagsplatsen.se',
    listingUrl: 'https://www.bolagsplatsen.se/foretag-till-salu/alla/alla',
    pagination: '?page=',
    priority: 2,
    maxPages: 5
  },
  // PRIORITY 3: Objektvision - Needs more specific logic to filter noise.
  objektvision: {
    baseUrl: 'https://objektvision.se',
    listingUrl: 'https://objektvision.se/företag_till_salu',
    pagination: '?page=',
    priority: 3,
    maxPages: 3
  },
  // PRIORITY 4: SMERGERS - International site, requires careful data extraction.
  smergers: {
    baseUrl: 'https://www.smergers.com',
    listingUrl: 'https://www.smergers.com/businesses-for-sale-in-sweden/c415t2b/',
    pagination: '?page=',
    priority: 4,
    maxPages: 3
  }
};

// --- Core Scraping & Extraction Logic ---

/**
 * Scrapes a single page, collecting all text and links.
 * Returns a raw, unstructured collection of data.
 * This function is designed to be very broad and not miss anything.
 */
async function scrapePage(url, website, retryCount = 0) {
  try {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const config = {
      headers: {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 25000
    };

    console.log(`Scraping ${website}: ${url}`);
    const response = await axios.get(url, config);
    const $ = cheerio.load(response.data);

    // Collect all links and their text
    const scrapedLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text) {
        scrapedLinks.push({ text, href });
      }
    });

    // Collect all meaningful text from the page, separating by newlines
    const scrapedText = $('h1, h2, h3, h4, p, span, li, a').map((i, el) => $(el).text().trim()).get();

    return {
      success: true,
      website,
      url,
      links: scrapedLinks,
      text: scrapedText,
      html_length: response.data.length
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);

    if (retryCount < 2) {
      const waitTime = 2000 * (retryCount + 1);
      console.log(`Retrying ${url} in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return scrapePage(url, website, retryCount + 1);
    }

    return {
      success: false,
      website,
      url,
      error: error.message,
      links: [],
      text: []
    };
  }
}

/**
 * Analyzes raw scraped data to find business listings based on keywords and patterns.
 * This function has been improved to better handle varied data structures.
 */
function findBusinessListings(rawScrapedData, websiteConfig) {
  const businesses = [];
  const processedText = new Set();
  const allText = rawScrapedData.text.join('\n');

  // Regex to find blocks of text that likely represent a business listing
  // This looks for a title-like line followed by a description or keywords
  const listingBlocks = allText.split(/(?=Omsättning|omsätter|Oms\.)/i);

  listingBlocks.forEach(block => {
    const lowerBlock = block.toLowerCase();
    
    // Keywords to confirm it's a business listing
    const isBusiness = ['företag', 'verksamhet', 'bolag', 'business', 'till salu'].some(keyword => lowerBlock.includes(keyword));

    if (!isBusiness) return;

    // A more accurate way to find the title from the block
    let title = '';
    const titleCandidates = block.split('\n').filter(line => line.trim().length > 10 && !line.includes('http') && !line.includes('Omsättning'));
    if (titleCandidates.length > 0) {
      title = titleCandidates[0].trim().replace(/[^\w\sÅÄÖ-]/g, '');
    }

    if (!title || processedText.has(title)) return;
    processedText.add(title);
    
    // Extract key data points with better regex
    let revenue = 'Not disclosed';
    const revenueMatch = block.match(/(?:omsättning|oms|revenue)[^0-9]*([0-9,.\s]+(?:miljoner|mkr|msek|kr))/i);
    if (revenueMatch && revenueMatch[1]) {
      revenue = revenueMatch[1].trim();
    }

    let profit = 'Not disclosed';
    const profitMatch = block.match(/(?:resultat|vinst|profit|ebitda)[^0-9]*([0-9,.\s]+(?:%|miljoner|mkr|msek))/i);
    if (profitMatch && profitMatch[1]) {
      profit = profitMatch[1].trim();
    }
    
    let location = 'Sweden';
    const locationMatch = block.match(/(Stockholm|Göteborg|Malmö|Uppsala|Linköping|Örebro|Västerås|Norrköping|Helsingborg|Jönköping|Umeå|Sundsvall)/i);
    if (locationMatch && locationMatch[1]) {
      location = locationMatch[1].trim();
    }

    let description = block.substring(0, 300) + '...';
    
    let link = rawScrapedData.url;
    const linkMatch = block.match(/(https?:\/\/[^\s\)]+)/);
    if (linkMatch && linkMatch[1]) {
      link = linkMatch[1].trim();
    }
    
    businesses.push({
      title: title,
      company: title,
      location: location,
      price: 'Price on request',
      revenue: revenue,
      profit: profit,
      industry: 'Various',
      category: 'Business for Sale',
      description: description,
      link: link,
      website_source: websiteConfig.name,
      scraped_at: new Date().toISOString(),
      currency: 'SEK',
      extraction_method: 'text_pattern_match_refined'
    });
  });

  return businesses;
}


// --- Main Scraping & Processing Functions ---

/**
 * Main function to orchestrate the entire scraping process.
 * It scrapes all defined websites, processes the data, and returns a consolidated result.
 */
async function scrapeAllWebsites() {
  const results = {
    success: true,
    scraped_at: new Date().toISOString(),
    websites: {},
    summary: {
      total_businesses: 0,
      successful_sites: 0,
      failed_sites: 0
    }
  };

  const websiteEntries = Object.entries(WEBSITES).sort(([,a], [,b]) => a.priority - b.priority);

  for (const [websiteName, config] of websiteEntries) {
    console.log(`Scraping ${websiteName} (priority ${config.priority})...`);

    try {
      let allBusinesses = [];
      for (let page = 1; page <= config.maxPages; page++) {
        const url = page === 1 ? config.listingUrl : `${config.listingUrl}${config.pagination}${page}`;
        const pageResult = await scrapePage(url, websiteName);

        if (pageResult.success && (pageResult.links.length > 0 || pageResult.text.length > 0)) {
          const businessesFromPage = findBusinessListings(pageResult, config);
          allBusinesses = allBusinesses.concat(businessesFromPage);
          console.log(`${websiteName} page ${page}: Found ${businessesFromPage.length} potential businesses`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Rate limiting
        } else {
          console.log(`${websiteName} page ${page}: No more data found, stopping pagination`);
          break;
        }
      }

      results.websites[websiteName] = {
        success: true,
        url: config.listingUrl,
        count: allBusinesses.length,
        businesses: allBusinesses,
        error: null,
        pages_scraped: allBusinesses.length > 0 ? Math.ceil(allBusinesses.length / (allBusinesses.filter(b => b.link === config.listingUrl).length || 1)) : 0
      };
      
      results.summary.successful_sites++;
      results.summary.total_businesses += allBusinesses.length;

    } catch (error) {
      console.error(`Failed to scrape ${websiteName}:`, error.message);
      results.websites[websiteName] = {
        success: false,
        url: config.listingUrl,
        count: 0,
        businesses: [],
        error: error.message
      };
      results.summary.failed_sites++;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

/**
 * Dedupication function with normalized key.
 */
function deduplicateBusinesses(businesses) {
  const seen = new Map();
  const deduplicated = [];

  for (const business of businesses) {
    const normalizedTitle = business.title.toLowerCase().replace(/[^a-z0-9åäö\s]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedLocation = business.location.toLowerCase().replace(/[^a-z0-9åäö\s]/g, '').replace(/\s+/g, ' ').trim();
    const key = `${normalizedTitle}_${normalizedLocation}`;
    
    if (!seen.has(key)) {
      seen.set(key, business);
      deduplicated.push(business);
    }
  }
  return deduplicated;
}

/**
 * Filters the unique businesses to find the ones in the target range.
 * This has been improved to handle different revenue/profit formats.
 */
function filterByProfitRange(businesses) {
  return businesses.filter(business => {
    const searchText = `${business.revenue} ${business.profit} ${business.description} ${business.title}`.toLowerCase();
    
    // Look for revenue/size indicators that suggest a significant business
    const indicators = [
      // Swedish millions (e.g., 20 mkr, 15 miljoner)
      /([0-9,.]*?)\s*(?:miljoner?|mkr|msek)/gi,
      // Employee count 20+
      /([2-9][0-9]|[1-9][0-9][0-9]+)\s*(?:anställda|employees|personal)/gi,
      // Profitability keywords
      /(lönsam|vinst|ebitda|profitable)/gi
    ];
    
    // Check if any of the indicators are present
    const hasIndicator = indicators.some(pattern => searchText.match(pattern));
    
    // A more precise check for million-scale revenue
    if (!hasIndicator && business.revenue !== 'Not disclosed') {
      const revenueNumber = parseFloat(business.revenue.replace(/[^0-9.]/g, ''));
      if (revenueNumber >= 15 && revenueNumber < 100) {
        return true;
      }
    }
    
    return hasIndicator;
  });
}

// --- API Routes ---

app.get('/scrape', async (req, res) => {
  try {
    console.log('Starting comprehensive Swedish business scraping...');
    const results = await scrapeAllWebsites();
    
    let allBusinesses = [];
    Object.values(results.websites).forEach(site => {
      if (site.businesses) {
        allBusinesses = allBusinesses.concat(site.businesses);
      }
    });

    const uniqueBusinesses = deduplicateBusinesses(allBusinesses);
    const filteredBusinesses = filterByProfitRange(uniqueBusinesses);

    const response = {
      success: true,
      scraped_at: results.scraped_at,
      summary: {
        ...results.summary,
        total_unique_businesses: uniqueBusinesses.length,
        businesses_in_target_range: filteredBusinesses.length,
        deduplication_removed: allBusinesses.length - uniqueBusinesses.length
      },
      websites: results.websites,
      pages: [
        {
          url: 'Swedish Business Listings - Combined',
          content: 'Aggregated data from major Swedish business-for-sale websites',
          businesses: filteredBusinesses
        }
      ],
      details: filteredBusinesses
    };

    console.log(`Final response: ${filteredBusinesses.length} businesses in target range`);
    res.json(response);
    
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      pages: [],
      details: []
    });
  }
});

app.listen(PORT, () => {
  console.log(`Swedish Business Scraper v4.0 running on port ${PORT}`);
});
