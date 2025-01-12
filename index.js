require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const firebaseAdmin = require('firebase-admin');

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(bodyParser.json());
app.use(cors());

// Firebase Admin setup
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
};

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});

console.log('Firebase initialized successfully!');

// Sequelize setup
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

// Define Operation model
const Operation = sequelize.define('Operation', {
  num1: { type: DataTypes.FLOAT, allowNull: false },
  num2: { type: DataTypes.FLOAT, allowNull: false },
  operation: { type: DataTypes.STRING(1), allowNull: false },
  result: { type: DataTypes.FLOAT, allowNull: false },
});

// Sync the database
sequelize.sync({ force: false }).then(() => {
  console.log('Database connected and table created (if not exists).');
});

// Utility: Send Firebase notifications
const sendNotification = async (deviceToken, title, message) => {
  try {
    const payload = {
      notification: { title, body: message },
      token: deviceToken,
    };
    const response = await firebaseAdmin.messaging().send(payload);
    console.log('Notification sent successfully:', response);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

// Route to check proceed status
app.post('/checkProceed', (req, res) => {
  const proceedSuccess = process.env.PROCEED_SUCCESS === '1';
  res.json({ status: proceedSuccess ? 1 : 0 });
});

// Route to perform a calculation
app.post('/calculate', async (req, res) => {
  const { num1, num2, operation, deviceToken } = req.body;

  try {
    let result;
    switch (operation) {
      case '+': result = num1 + num2; break;
      case '-': result = num1 - num2; break;
      case '*': result = num1 * num2; break;
      case '/':
        if (num2 === 0) return res.status(400).json({ error: 'Cannot divide by zero' });
        result = num1 / num2;
        break;
      default: return res.status(400).json({ error: 'Invalid operation' });
    }

    const operationRecord = await Operation.create({ num1, num2, operation, result });

    if (deviceToken) {
      sendNotification(deviceToken, 'Calculation Complete', `The result of ${num1} ${operation} ${num2} is ${result}`);
    }

    const updatedHistory = await Operation.findAll();
    res.json({ result, operation: operationRecord, updatedHistory });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save operation', details: error.message });
  }
});

// Route to fetch all operations
app.get('/history', async (req, res) => {
  try {
    const history = await Operation.findAll();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Route to update a specific operation
app.put('/history/:id', async (req, res) => {
  const { id } = req.params;
  const { num1, num2, operation } = req.body;

  try {
    const operationRecord = await Operation.findByPk(id);
    if (!operationRecord) return res.status(404).json({ error: 'Operation not found' });

    let result;
    switch (operation) {
      case '+': result = num1 + num2; break;
      case '-': result = num1 - num2; break;
      case '*': result = num1 * num2; break;
      case '/':
        if (num2 === 0) return res.status(400).json({ error: 'Cannot divide by zero' });
        result = num1 / num2;
        break;
      default: return res.status(400).json({ error: 'Invalid operation' });
    }

    operationRecord.num1 = num1;
    operationRecord.num2 = num2;
    operationRecord.operation = operation;
    operationRecord.result = result;
    await operationRecord.save();

    const updatedHistory = await Operation.findAll();
    res.json({ message: 'Operation updated successfully', updatedHistory });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update operation', details: error.message });
  }
});

// Route to delete a specific operation
app.delete('/history/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const operation = await Operation.findByPk(id);
    if (!operation) return res.status(404).json({ error: 'Operation not found' });

    await operation.destroy();

    const updatedHistory = await Operation.findAll();
    res.json({ message: 'Operation deleted successfully', updatedHistory });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete operation', details: error.message });
  }
});

// Route to delete all operations
app.delete('/history', async (req, res) => {
  try {
    await Operation.destroy({ where: {} });

    res.json({ message: 'All operations deleted successfully', updatedHistory: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete all operations', details: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/web' + '/index.html');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
