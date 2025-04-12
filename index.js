const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Datastore = require('nedb');
const fs = require('fs');

// Initialize NeDB
const dbFilePath = 'db.json';
const db = new Datastore({ filename: dbFilePath, autoload: true });

// Function to read the database and set up IPC handlers
async function initializeDatabase() {
    // Check if the db.json file exists
    if (!fs.existsSync(dbFilePath)) {
        // Initialize the database with default structure if it doesn't exist
        const defaultData = {
            isoConfigs: {
                "HPDH": [
                    {
                        "bmpPosition": 1,
                        "lengthType": "Fixed",
                        "dataType": "Numeric",
                        "justification": "Right",
                        "filler": "0",
                        "fieldName": "Transaction Code",
                        "defaultValue": "000000"
                    },
                    {
                        "bmpPosition": 2,
                        "lengthType": "Variable",
                        "dataType": "Alphanumeric",
                        "justification": "Left",
                        "filler": " ",
                        "fieldName": "Primary Account Number",
                        "defaultValue": ""
                    }
                ]
            }
        };

        // Insert default data into the database
        db.insert(defaultData, (err) => {
            if (err) {
                console.error('Error initializing database:', err);
            } else {
                console.log('Initialized database with default structure.');
            }
        });
    } else {
        // If the file exists, check for corruption
        db.loadDatabase((err) => {
            if (err) {
                console.error('Error loading database:', err);
                initializeDatabase(); // Reinitialize the database
            } else {
                console.log('Database loaded successfully.');
            }
        });
    }
}

// IPC handlers for database operations
ipcMain.handle('get-iso-configs', async () => {
    return new Promise((resolve, reject) => {
        db.find({}, (err, docs) => {
            if (err) {
                reject(err);
            } else {
                resolve(docs[0]?.isoConfigs || {}); // Return the ISO configurations
            }
        });
    });
});

ipcMain.handle('save-iso-config', async (event, configName, configData) => {
    return new Promise((resolve, reject) => {
        // Update the configuration in the database
        db.update(
            { [`isoConfigs.${configName}`]: { $exists: true } },
            { $set: { [`isoConfigs.${configName}`]: configData } },
            {},
            (err, numReplaced) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(numReplaced);
                }
            }
        );
    });
});

// Create the browser window
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    initializeDatabase().then(() => {
        createWindow(); // Create the window after initializing the database
    }).catch(err => {
        console.error('Error initializing database:', err);
    });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// On macOS, re-create a window in the app when the dock icon is clicked
// and there are no other windows open.
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
}); 