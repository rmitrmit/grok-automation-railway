const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'grok-aurora-automation',
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
    console.log('🔄 Starting Grok Aurora automation...');
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
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
    
    // Step 1: Navigate to Grok
    console.log('📋 Navigating to grok.com...');
    await page.goto('https://grok.com', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Step 2: Look for Aurora image editing interface
    console.log('🔍 Looking for Aurora image editing interface...');
    
    // Wait for page to load and look for image upload elements
    await page.waitForTimeout(3000);
    
    const interfaceElements = await page.evaluate(() => {
      const elements = {
        imageInputs: Array.from(document.querySelectorAll('input[type="file"]')).length,
        textInputs: Array.from(document.querySelectorAll('textarea, input[type="text"]')).length,
        buttons: Array.from(document.querySelectorAll('button')).map(btn => btn.textContent?.trim()).slice(0, 10),
        auroreElements: Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent?.toLowerCase().includes('aurora') || 
          el.textContent?.toLowerCase().includes('image') ||
          el.textContent?.toLowerCase().includes('edit')
        ).map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 50),
          id: el.id,
          className: el.className
        })).slice(0, 10)
      };
      return elements;
    });
    
    console.log('Interface analysis:', interfaceElements);
    
    // Step 3: Try to find image upload mechanism
    const imageUploadFound = await page.evaluate(() => {
      // Look for file input or drag-drop areas
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const dropZones = document.querySelectorAll('[class*="drop"], [class*="upload"], [data-testid*="upload"]');
      
      return {
        fileInputs: fileInputs.length,
        dropZones: dropZones.length,
        hasUploadArea: fileInputs.length > 0 || dropZones.length > 0
      };
    });
    
    console.log('Upload mechanism found:', imageUploadFound);
    
    if (imageUploadFound.hasUploadArea) {
      console.log('✅ Found image upload interface');
      
      // Step 4: Download and prepare image for upload
      console.log('📥 Downloading image for upload...');
      const imageResponse = await page.goto(imageUrl);
      const imageBuffer = await imageResponse.buffer();
      
      // Create temporary file path (in Docker container)
      const fs = require('fs');
      const path = require('path');
      const tempImagePath = path.join('/tmp', 'upload_image.jpg');
      fs.writeFileSync(tempImagePath, imageBuffer);
      
      // Step 5: Upload image
      console.log('📤 Uploading image to Grok...');
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(tempImagePath);
        await page.waitForTimeout(2000); // Wait for upload processing
      }
      
      // Step 6: Find text input for prompt
      console.log('✏️ Entering prompt...');
      const textInputs = await page.$$('textarea, input[type="text"]');
      if (textInputs.length > 0) {
        await textInputs[0].type(prompt);
        await page.waitForTimeout(1000);
      }
      
      // Step 7: Find and click process/generate button
      console.log('🚀 Triggering image editing...');
      const submitButtons = await page.$$eval('button', buttons => 
        buttons.filter(btn => {
          const text = btn.textContent?.toLowerCase();
          return text?.includes('generate') || 
                 text?.includes('edit') || 
                 text?.includes('create') || 
                 text?.includes('process') ||
                 text?.includes('submit');
        })
      );
      
      if (submitButtons.length > 0) {
        await page.click('button:has-text("generate"), button:has-text("edit"), button:has-text("create")');
        console.log('⏳ Waiting for Grok to process image...');
        
        // Wait for processing (adjust timeout as needed)
        await page.waitForTimeout(10000);
        
        // Step 8: Look for result image
        console.log('🔍 Looking for edited image result...');
        const resultImages = await page.$$eval('img', imgs => 
          imgs.map(img => ({
            src: img.src,
            alt: img.alt,
            width: img.width,
            height: img.height
          })).filter(img => img.src && !img.src.includes('data:image'))
        );
        
        console.log('Found result images:', resultImages.length);
        
        if (resultImages.length > 0) {
          // Return the most likely result image (largest, most recent, etc.)
          const resultImage = resultImages[resultImages.length - 1];
          
          console.log('✅ Grok Aurora automation successful!');
          res.json({
            success: true,
            editedImageUrl: resultImage.src,
            message: 'Image successfully edited using Grok Aurora',
            processingTime: '10s',
            originalPrompt: prompt
          });
        } else {
          throw new Error('No result images found after processing');
        }
      } else {
        throw new Error('No submit/generate button found');
      }
      
      // Cleanup
      fs.unlinkSync(tempImagePath);
      
    } else {
      throw new Error('No image upload interface found on Grok');
    }
    
  } catch (error) {
    console.error('❌ Grok Aurora automation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stage: 'automation_execution'
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Grok Aurora Automation Service on port ${PORT}`);
});
