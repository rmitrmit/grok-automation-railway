const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'grok-automation-railway',
    timestamp: new Date().toISOString(),
    chrome: 'available'
  });
});

app.post('/grok/web-edit', async (req, res) => {
  const { imageUrl, prompt } = req.body;
  
  if (!imageUrl || !prompt) {
    return res.status(400).json({
      success: false,
      error: 'imageUrl and prompt are required'
    });
  }

  let browser = null;
  
  try {
    const puppeteer = require('puppeteer');
    
    console.log('🔄 Starting Grok web automation with Chrome...');
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    console.log('📋 Navigating to grok.com...');
    await page.goto('https://grok.com', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    console.log('🔍 Analyzing Grok interface...');
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      hasImageUpload: !!document.querySelector('input[type="file"]'),
      hasTextInput: !!document.querySelector('textarea, input[type="text"]')
    }));
    
    console.log('Page analysis:', pageInfo);
    
    // For now, return success with debug info
    // TODO: Complete Aurora interface automation
    res.json({
      success: true,
      message: 'Grok automation framework working with Chrome!',
      debug: pageInfo,
      nextSteps: 'Complete Aurora interface interaction logic'
    });
    
  } catch (error) {
    console.error('❌ Grok automation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Grok Automation Service with Chrome on port ${PORT}`);
});
