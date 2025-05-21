const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const cors = require('cors'); // Import the cors package
const { Writable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
 const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/mysecuredb', {
  useNewUrlParser: true,
  useUnifiedTopology: true, // optional in latest versions
  user: 'myuser',
  pass: 'MySecurePass456!',
  authSource: 'mysecuredb',
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});
const productSchema = new mongoose.Schema({}, { strict: false });
const styleSchema = new mongoose.Schema({}, { strict: false });

const Product = mongoose.model('Product', productSchema);
const Style = mongoose.model('Style', styleSchema);

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

// Refresh every 10 minutes
setInterval(fetchProductData, 10 * 60 * 1000);
setInterval(fetchStyleData, 10 * 60 * 1000);

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


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
