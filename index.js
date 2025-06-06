const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const cors = require('cors'); // Import the cors package
const { Writable } = require('stream');
const multer = require('multer');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const router = express.Router();

const BASE_URL = 'http://localhost:3000'; // your express app's base url
const SS_IMAGE_BASE = 'https://www.ssactivewear.com/';
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');
const OUTPUT_DIR = path.join(__dirname, '../public/output');

// Serve static folders if not already set in app.js or server.js
// app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// app.use('/output', express.static(path.join(__dirname, 'public/output')));


// Setup multer for image upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// Serve static folders for processed images and uploads BEFORE any routes
app.use('/output', express.static(path.join(__dirname, '../public/output')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// MongoDB connection
 const mongoose = require('mongoose');

mongoose.connect('mongodb://myuser:MySecurePass456!@localhost:27017/mysecuredb?authSource=mysecuredb')
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
const productSchema = new mongoose.Schema({}, { strict: false });
const styleSchema = new mongoose.Schema({}, { strict: false });
const brandSchema = new mongoose.Schema({}, { strict: false });  
const Product = mongoose.model('Product', productSchema);
const Style = mongoose.model('Style', styleSchema);
const Brand = mongoose.model('Brand', brandSchema);
const ACCOUNT_NUMBER = '13947';
const API_KEY = 'c277e887-cae2-457b-9f20-c40dd3ea40b5';
const FILE_PATH = path.join(__dirname, 'products.json');
const STYLES_FILE_PATH = path.join(__dirname, 'styles.json');

// Fetch and save product data to a JSON file
async function fetchProductData() {
  try {
    const url = `https://api.ssactivewear.com/v2/products/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_NUMBER}:${API_KEY}`).toString('base64'),
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      return;
    }

    await Product.deleteMany({}); // Clear old records
    let insertedCount = 0; // ← Count inserted products

    const pipeline = chain([
      response.body,
      parser(),
      streamArray(),
      new Writable({
        objectMode: true,
        write: async ({ value }, encoding, callback) => {
          try {
            await Product.create(value);
            insertedCount++;
            callback();
          } catch (err) {
            console.error('Insert error:', err);
            callback(err);
          }
        }
      })
    ]);

    pipeline.on('finish', () => {
      console.log(`✅ All products inserted successfully. Total inserted: ${insertedCount}`);
    });

    pipeline.on('error', (err) => {
      console.error('Stream error:', err);
    });

  } catch (error) {
    console.error('Error fetching product data:', error);
  }
}
 async function fetchBrandData() {
  try {
    const url = `https://api.ssactivewear.com/v2/Brands/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_NUMBER}:${API_KEY}`).toString('base64'),
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch styles: ${response.status} ${response.statusText}`);
      return;
    }

    const brand = await response.json();
    await Brand.deleteMany({});
    await Brand.insertMany(brand);
    console.log(`Inserted ${brand.length} brands into MongoDB`);
  } catch (error) {
    console.error('Error fetching btands data:', error);
  }
}

async function fetchStyleData() {
  try {
    const url = `https://api.ssactivewear.com/v2/styles/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_NUMBER}:${API_KEY}`).toString('base64'),
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch styles: ${response.status} ${response.statusText}`);
      return;
    }

    const styles = await response.json();
    await Style.deleteMany({});
    await Style.insertMany(styles);
    console.log(`Inserted ${styles.length} styles into MongoDB`);
  } catch (error) {
    console.error('Error fetching style data:', error);
  }
}


// Initial fetch
fetchProductData();
fetchStyleData();
fetchBrandData();
// Refresh every 10 minutes
setInterval(fetchProductData, 10 * 60 * 1000);
setInterval(fetchStyleData, 10 * 60 * 1000);
setInterval(fetchBrandData, 10 * 60 * 1000);
// API endpoint to serve paginated styles
// API endpoint to check if products exist for a specific style ID
app.get('/api/products/style/:styleId', async (req, res) => {
  const styleId = parseInt(req.params.styleId);
  try {
    const products = await Product.find({ styleID: styleId });
    if (products.length > 0) {
      res.json({ styleId, products });
    } else {
      res.status(404).json({ error: `No products found for style ID: ${styleId}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
app.get('/api/styles/base-categories', async (req, res) => {
  try {
    // Filter out null/missing baseCategory
    const baseCategories = await Style.aggregate([
      {
        $match: {
          baseCategory: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$baseCategory'
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      count: baseCategories.length,
      baseCategories: baseCategories.map(c => c._id)
    });
  } catch (error) {
    console.error('Error fetching base categories:', error);
    res.status(500).json({ error: 'MongoDB aggregation failed' });
  }
});
app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
  try {
    const fileExt = path.extname(req.file.originalname) || '.jpg';
    const uniqueId = uuidv4();
    const inputFile = `input-${uniqueId}${fileExt}`;
    const outputFile = `output-${uniqueId}.png`;

    const inputPath = path.join(__dirname, 'uploads', inputFile);
    const outputPath = path.join(__dirname, 'uploads', outputFile);

    // Save uploaded image to disk
    fs.writeFileSync(inputPath, req.file.buffer);

    // Run rembg.py from scripts directory
    const scriptPath = path.join(__dirname, 'scripts', 'rembg.py');
    const python = spawn('python', [scriptPath, 'i', inputPath, outputPath]);

    python.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    python.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: 'Background removal failed.' });
      }

      fs.readFile(outputPath, (err, data) => {
        if (err) return res.status(500).json({ error: 'Output image read failed.' });

        const base64Image = data.toString('base64');

        // Clean up
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        res.json({ image: `data:image/png;base64,${base64Image}` });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});
router.post('/api/process-product/:sku', async (req, res) => {
  const sku = req.params.sku;
  const logPrefix = `[SKU: ${sku}]`;

  try {
    console.log(`${logPrefix} No uploaded images, using product images...`);

    // 1. Fetch product from MongoDB API
    const productRes = await axios.get(`${BASE_URL}/api/products/sku/${encodeURIComponent(sku)}`);
    const product = productRes.data.product;

    if (!product) {
      return res.status(404).json({ error: `No product found with SKU "${sku}"` });
    }

    // 2. Gather image fields and paths
    const imageFields = [
      'colorFrontImage',
      'colorBackImage',
      'colorDirectSideImage',
      'colorSideImage',
      'colorSwatchImage',
      'colorOnModelFrontImage',
      'colorOnModelSideImage',
      'colorOnModelBackImage',
    ];
    const imagePaths = imageFields.map(f => product[f]).filter(Boolean);

    if (imagePaths.length === 0) {
      return res.status(400).json({ error: 'No image URLs found for this product.' });
    }

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    const processedUrls = [];

    for (const imagePath of imagePaths) {
      try {
        const imageUrl = `${SS_IMAGE_BASE}${imagePath}`;
        const ext = path.extname(imagePath) || '.jpg';
        const id = uuidv4();
        const inputName = `input-${id}${ext}`;
        const outputName = `output-${id}.png`;
        const inputPath = path.join(UPLOADS_DIR, inputName);
        const outputPath = path.join(OUTPUT_DIR, outputName);

        const writer = fs.createWriteStream(inputPath);
        const response = await axios({ method: 'GET', url: imageUrl, responseType: 'stream' });

        await new Promise((resolve, reject) => {
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        // 3. Run Python command: python rembg.py i input.jpg output.png (with correct script path)
        const scriptPath = path.join(__dirname, 'scripts', 'rembg.py');
        await new Promise((resolve, reject) => {
          const python = spawn('python', [scriptPath, 'i', inputPath, outputPath]);

          python.stdout.on('data', data => console.log(`[Python STDOUT] ${data}`));
          python.stderr.on('data', data => console.error(`[Python STDERR] ${data}`));

          python.on('close', code => {
            if (code !== 0) {
              return reject(new Error(`Python script exited with code ${code}`));
            }
            return resolve();
          });
        });

        // 4. Create public URL for processed image
        processedUrls.push(`${BASE_URL}/output/${outputName}`);

      } catch (err) {
        console.error(`${logPrefix} Error processing image:`, err.message);
        processedUrls.push(null); // keep array in sync
      }
    }

    // Overwrite product image fields with processed URLs (or null if failed)
    const productWithProcessedImages = { ...product };
    let urlIdx = 0;
    for (const field of imageFields) {
      if (productWithProcessedImages[field]) {
        productWithProcessedImages[field] = processedUrls[urlIdx] || productWithProcessedImages[field];
        urlIdx++;
      }
    }

    return res.json(productWithProcessedImages);

  } catch (err) {
    console.error(`${logPrefix} Error:`, err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});
router.post('cc:sku', async (req, res) => {
  const sku = req.params.sku;
  const logPrefix = `[SKU: ${sku}]`;

  try {
    console.log(`${logPrefix} No uploaded images, using product images...`);

    // 1. Fetch product from MongoDB API
    const productRes = await axios.get(`${BASE_URL}/api/products/sku/${encodeURIComponent(sku)}`);
    const product = productRes.data.product;

    if (!product) {
      return res.status(404).json({ error: `No product found with SKU "${sku}"` });
    }

    // 2. Gather image paths
    const imagePaths = [
      product.colorFrontImage,
      product.colorBackImage,
      product.colorDirectSideImage,
      product.colorSideImage,
      product.colorSwatchImage,
      product.colorOnModelFrontImage,
      product.colorOnModelSideImage,
      product.colorOnModelBackImage,
    ].filter(Boolean);

    if (imagePaths.length === 0) {
      return res.status(400).json({ error: 'No image URLs found for this product.' });
    }

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    const resultUrls = [];

    for (const imagePath of imagePaths) {
      try {
        const imageUrl = `${SS_IMAGE_BASE}${imagePath}`;
        const ext = path.extname(imagePath) || '.jpg';
        const id = uuidv4();
        const inputName = `input-${id}${ext}`;
        const outputName = `output-${id}.png`;
        const inputPath = path.join(UPLOADS_DIR, inputName);
        const outputPath = path.join(OUTPUT_DIR, outputName);

        const writer = fs.createWriteStream(inputPath);
        const response = await axios({ method: 'GET', url: imageUrl, responseType: 'stream' });

        await new Promise((resolve, reject) => {
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        // 3. Run Python command: python rembg.py input.jpg output.png
        await new Promise((resolve, reject) => {
          const python = spawn('python', ['rembg.py', inputPath, outputPath]);

          python.stdout.on('data', data => console.log(`[Python STDOUT] ${data}`));
          python.stderr.on('data', data => console.error(`[Python STDERR] ${data}`));

          python.on('close', code => {
            if (code !== 0) {
              return reject(new Error(`Python script exited with code ${code}`));
            }
            return resolve();
          });
        });

        // 4. Create public URL for processed image
        resultUrls.push(`${BASE_URL}/output/${outputName}`);

      } catch (err) {
        console.error(`${logPrefix} Error processing image:`, err.message);
      }
    }

    if (resultUrls.length === 0) {
      return res.status(500).json({ error: 'All image processing failed.' });
    }

    return res.json({ sku, imageUrls: resultUrls });

  } catch (err) {
    console.error(`${logPrefix} Error:`, err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});
app.get('/api/brands', async (req, res) => {
  try {
    const brands = await Brand.find({});
    res.json({ count: brands.length, brands });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
app.get('/api/styles/by-base-category/:category', async (req, res) => {
  const inputCategory = decodeURIComponent(req.params.category).trim();

  try {
    // Find styles that match the given baseCategory (case-insensitive)
    const styles = await Style.find({
      baseCategory: new RegExp(`^${inputCategory}$`, 'i')
    });

    if (styles.length > 0) {
      res.json({ count: styles.length, baseCategory: inputCategory, styles });
    } else {
      res.status(404).json({ error: `No styles found for baseCategory "${inputCategory}"` });
    }
  } catch (error) {
    console.error('Error fetching styles by baseCategory:', error);
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
// Get all unique brand names from Styles collection
app.get('/api/styles/brand-names', async (req, res) => {
  try {
    const brandNames = await Style.distinct('brandName');
    const cleanedBrandNames = brandNames.filter(name => name && name.trim() !== '');

    res.json({
      count: cleanedBrandNames.length,
      brandNames: cleanedBrandNames
    });
  } catch (error) {
    console.error('Error fetching brand names:', error);
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
// Get styles by brand name
app.get('/api/styles/by-brand/:brandName', async (req, res) => {
  const inputBrand = decodeURIComponent(req.params.brandName).trim();

  try {
    const styles = await Style.find({
      brandName: new RegExp(`^${inputBrand}$`, 'i') // Case-insensitive match
    });

    if (styles.length > 0) {
      res.json({ count: styles.length, brandName: inputBrand, styles });
    } else {
      res.status(404).json({ error: `No styles found for brand "${inputBrand}"` });
    }
  } catch (error) {
    console.error('Error fetching styles by brand:', error);
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
// Get products by brand name (by finding styles first)
app.get('/api/products/by-brand/:brandName', async (req, res) => {
  const inputBrand = decodeURIComponent(req.params.brandName).trim();

  try {
    const styles = await Style.find({
      brandName: new RegExp(`^${inputBrand}$`, 'i')
    });

    if (styles.length === 0) {
      return res.status(404).json({ error: `No styles found for brand "${inputBrand}"` });
    }

    const styleIDs = styles.map(style => style.styleID);
    const products = await Product.find({ styleID: { $in: styleIDs } });

    if (products.length === 0) {
      return res.status(404).json({ error: `No products found for brand "${inputBrand}"` });
    }

    res.json({ brandName: inputBrand, count: products.length, products });
  } catch (error) {
    console.error('Error fetching products by brand:', error);
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});
// Get all products based on baseCategory (via styleID linkage)
app.get('/api/products/by-base-category/:baseCategory', async (req, res) => {
  const baseCategory = decodeURIComponent(req.params.baseCategory).trim();

  try {
    // Step 1: Find all styles with the given baseCategory
    const styles = await Style.find({
      baseCategory: new RegExp(`^${baseCategory}$`, 'i') // case-insensitive
    });

    if (styles.length === 0) {
      return res.status(404).json({ error: `No styles found for base category "${baseCategory}"` });
    }

    // Step 2: Extract styleIDs
    const styleIDs = styles.map(style => style.styleID);

    // Step 3: Find all products with those styleIDs
    const products = await Product.find({ styleID: { $in: styleIDs } });

    if (products.length === 0) {
      return res.status(404).json({ error: `No products found for base category "${baseCategory}"` });
    }

    // Step 4: Respond with the products
    res.json({
      baseCategory,
      styleCount: styles.length,
      productCount: products.length,
      products
    });

  } catch (error) {
    console.error('Error in /api/products/by-base-category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Route 1: Get all style titles
app.get('/api/styles/titles', async (req, res) => {
  try {
    const styles = await Style.find({}, 'title');
    const titles = styles.map(style => style.title);
    res.json({ count: titles.length, titles });
  } catch (error) {
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});

// Route 3: Get a single product by SKU
app.get('/api/products/sku/:sku', async (req, res) => {
  const inputSKU = decodeURIComponent(req.params.sku).toUpperCase().trim();
  try {
    const product = await Product.findOne({ sku: new RegExp(`^${inputSKU}$`, 'i') });
    if (product) {
      res.json({ product });
    } else {
      res.status(404).json({ error: `No product found with SKU "${inputSKU}"` });
    }
  } catch (error) {
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});


// Route 2: Get products by style title
app.get('/api/products/by-title/:title', async (req, res) => {
  const inputTitle = decodeURIComponent(req.params.title).toLowerCase().trim();

  try {
    const style = await Style.findOne({ title: new RegExp(`^${inputTitle}$`, 'i') });

    if (!style) {
      return res.status(404).json({ error: `No style found with title "${inputTitle}"` });
    }

    const products = await Product.find({ styleID: style.styleID });

    if (products.length > 0) {
      res.json({ styleID: style.styleID, products });
    } else {
      res.status(404).json({ error: `No products found for style title "${inputTitle}"` });
    }
  } catch (error) {
    res.status(500).json({ error: 'MongoDB query failed' });
  }
});

app.use(router);

// Serve static folders for processed images and uploads
app.use('/output', express.static(path.join(__dirname, '../public/output')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

const loginRouter = require('./routes/login');
app.use('/api/auth', loginRouter);

const ordersRouter = require('./routes/orders');
app.use('/api/orders', ordersRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
