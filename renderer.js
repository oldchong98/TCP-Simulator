const net = require('net');
const { ipcRenderer } = require('electron');

let server;
let client;
let clientsOfServer = new Set();
let isDumbIcashResponseEnabled = false;

// Object to store TCP connection information
const tcpConnectionInfo = {
    mode: 'server', // Default mode
    currentIp: '127.0.0.1',
    currentPort: '1234',
    targetIp: '127.0.0.1',
    targetPort: '63156',
    status: 'Down' // Initial status
};

// Function to load content dynamically
function loadContent(page) {
    fetch(page)
        .then(response => response.text())
        .then(html => {
            document.getElementById('content').innerHTML = html;
            // After loading new content, set up event listeners
            setupTcpConnectionListeners();
            // Populate fields with stored connection info if on connection_setup.html
            if (page === 'connection_setup.html') {
                populateTcpConnectionFields();
            }
            // Update the TCP status display on the new page
            updateTcpStatus(tcpConnectionInfo.status);
            // Set up event listeners for run.html
            if (page === 'run.html') {
                setupRunPageListeners();
                // Load displayed data from local storage
                const displayedData = localStorage.getItem('displayedData') || '';
                document.getElementById('dataDisplay').innerHTML = displayedData; // Populate display area
            }
            // Set up event listeners for iso_config.html
            if (page === 'iso_config.html') {
                loadIsoConfigs(); // Load ISO configurations
            }
        })
        .catch(err => console.error('Error loading page:', err));
}

// Event listeners for navigation
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent default link behavior
        const page = event.target.getAttribute('href');
        loadContent(page);
    });
});

// Load the default content (Connection Setup page) on initial load
document.addEventListener('DOMContentLoaded', () => {
    loadContent('connection_setup.html');
});

// Function to set up TCP connection event listeners
function setupTcpConnectionListeners() {
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const modeSelect = document.getElementById('mode');

    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            // Check if a connection is already active
            if (tcpConnectionInfo.status === 'Connected' || tcpConnectionInfo.status === 'Started') {
                alert('A TCP connection is already active. Please stop the current connection before starting a new one.');
                return; // Stop if a connection is already active
            }

            // Validate required fields
            if (!validateTcpConnectionFields()) {
                return; // Stop if validation fails
            }

            tcpConnectionInfo.mode = document.getElementById('mode').value;
            tcpConnectionInfo.currentIp = document.getElementById('currentIp').value;
            tcpConnectionInfo.currentPort = document.getElementById('currentPort').value;
            tcpConnectionInfo.targetIp = document.getElementById('targetIp').value;
            tcpConnectionInfo.targetPort = document.getElementById('targetPort').value;

            if (tcpConnectionInfo.mode === 'server') {
                startServer(tcpConnectionInfo.currentIp, tcpConnectionInfo.currentPort);
            } else if (tcpConnectionInfo.mode === 'client') {
                startClient(tcpConnectionInfo.targetIp, tcpConnectionInfo.targetPort);
            }
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            if (server) {
                server.close();
                tcpConnectionInfo.status = 'Down'; // Server stopped
                updateTcpStatus(tcpConnectionInfo.status);
            }
            if (client) {
                client.destroy();
                tcpConnectionInfo.status = 'Down'; // Client stopped
                updateTcpStatus(tcpConnectionInfo.status);
            }
        });
    }

    // Reset border styles when the mode changes
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            resetFieldBorders();
        });
    }
}

// Function to reset the border styles of input fields
function resetFieldBorders() {
    const currentIp = document.getElementById('currentIp');
    const currentPort = document.getElementById('currentPort');
    const targetIp = document.getElementById('targetIp');
    const targetPort = document.getElementById('targetPort');

    [currentIp, currentPort, targetIp, targetPort].forEach(field => {
        field.style.border = ''; // Reset border
    });
}

// Function to validate TCP connection fields
function validateTcpConnectionFields() {
    const currentIp = document.getElementById('currentIp');
    const currentPort = document.getElementById('currentPort');
    const targetIp = document.getElementById('targetIp');
    const targetPort = document.getElementById('targetPort');

    let isValid = true;

    // Reset previous error styles
    [currentIp, currentPort, targetIp, targetPort].forEach(field => {
        field.style.border = '';
    });

    // Check if required fields are filled
    if (tcpConnectionInfo.mode === 'server') {
        if (!currentIp.value || !currentPort.value) {
            isValid = false;
            if (!currentIp.value) {
                currentIp.style.border = '2px solid red'; // Highlight in red
            }
            if (!currentPort.value) {
                currentPort.style.border = '2px solid red'; // Highlight in red
            }
        }
    } else if (tcpConnectionInfo.mode === 'client') {
        if (!targetIp.value || !targetPort.value) {
            isValid = false;
            if (!targetIp.value) {
                targetIp.style.border = '2px solid red'; // Highlight in red
            }
            if (!targetPort.value) {
                targetPort.style.border = '2px solid red'; // Highlight in red
            }
        }
    }

    return isValid; // Return whether the fields are valid
}

// Function to populate TCP connection fields with stored info
function populateTcpConnectionFields() {
    document.getElementById('mode').value = tcpConnectionInfo.mode;
    document.getElementById('currentIp').value = tcpConnectionInfo.currentIp;
    document.getElementById('currentPort').value = tcpConnectionInfo.currentPort;
    document.getElementById('targetIp').value = tcpConnectionInfo.targetIp;
    document.getElementById('targetPort').value = tcpConnectionInfo.targetPort;
}

// TCP server and client functions
function startServer(ip, port) {
    tcpConnectionInfo.status = 'Started'; // Server started
    updateTcpStatus(tcpConnectionInfo.status);

    server = net.createServer((socket) => {
        console.log('Client connected');
        tcpConnectionInfo.status = 'Connected'; // Update status when a client connects
        updateTcpStatus(tcpConnectionInfo.status);
        clientsOfServer.add(socket); // Add socket to Clients

        socket.on('data', (data) => {
            const receivedAscii = data.toString(); // Convert received data to ASCII
            const receivedHex = data.toString('hex'); // Convert received data to HEX
            console.log('Received (Server):', receivedAscii);
            displayData(receivedAscii, receivedHex, 'received'); // Display received data

            // Check if Dumb ICash Response is enabled
            if (isDumbIcashResponseEnabled) {
                console.log('Dumb ICash Response: Modifying and sending back received data');
                
                // Modify the data: replace the 28th character (index 27) with '2'
                let responseAscii = receivedAscii;
                if (responseAscii.length >= 28) {
                    // Convert string to array, modify, then join back
                    let responseArray = responseAscii.split('');
                    responseArray[27] = '2'; // Index 27 is the 28th character
                    responseAscii = responseArray.join('');
                } else {
                    console.warn('Received data is too short to modify the 28th character.');
                }

                // Convert modified ASCII back to Buffer and HEX
                const responseBuffer = Buffer.from(responseAscii);
                const responseHex = responseBuffer.toString('hex');

                // Send the modified data back
                if (!socket.destroyed) {
                    socket.write(responseBuffer); // Send the modified Buffer back
                    displayData(responseAscii, responseHex, 'sent'); // Display modified sent data
                }
            }
        });
        socket.on('end', () => {
            console.log('Client disconnected');
            tcpConnectionInfo.status = 'Started'; // Client disconnected, server still running
            updateTcpStatus(tcpConnectionInfo.status);
            clientsOfServer.delete(socket);
        });
    });

    server.listen(port, ip, () => {
        console.log(`Server listening on ${ip}:${port}`);
    });

    server.on('error', (err) => {
        console.error(err);
        updateTcpStatus('Error: ' + err.message);
    });
}

function startClient(targetIp, targetPort) {
    tcpConnectionInfo.status = 'Connecting'; // Client is trying to connect
    updateTcpStatus(tcpConnectionInfo.status);

    client = new net.Socket();

    client.connect(targetPort, targetIp, () => {
        console.log(`Connected to server at ${targetIp}:${targetPort}`);
        tcpConnectionInfo.status = 'Connected'; // Client is connected
        updateTcpStatus(tcpConnectionInfo.status);
    });

    client.on('data', (data) => {
        const receivedAscii = data.toString(); // Convert received data to ASCII
        const receivedHex = data.toString('hex'); // Convert received data to HEX
        console.log('Received (Client):', receivedAscii);
        displayData(receivedAscii, receivedHex, 'received'); // Display received data

        // Check if Dumb ICash Response is enabled
        if (isDumbIcashResponseEnabled) {
            console.log('Dumb ICash Response: Modifying and sending back received data');
            
            // Modify the data: replace the 28th character (index 27) with '2'
            let responseAscii = receivedAscii;
            if (responseAscii.length >= 28) {
                // Convert string to array, modify, then join back
                let responseArray = responseAscii.split('');
                responseArray[27] = '2'; // Index 27 is the 28th character
                responseAscii = responseArray.join('');
            } else {
                console.warn('Received data is too short to modify the 28th character.');
            }

            // Convert modified ASCII back to Buffer and HEX
            const responseBuffer = Buffer.from(responseAscii);
            const responseHex = responseBuffer.toString('hex');

            // Send the modified data back
            if (!client.destroyed) {
                client.write(responseBuffer); // Send the modified Buffer back
                displayData(responseAscii, responseHex, 'sent'); // Display modified sent data
            }
        }
    });

    client.on('close', () => {
        console.log('Connection closed');
        tcpConnectionInfo.status = 'Down'; // Client disconnected
        updateTcpStatus(tcpConnectionInfo.status);
    });

    client.on('error', (err) => {
        console.error(err);
        tcpConnectionInfo.status = 'Down'; // Failed to connect
        updateTcpStatus(tcpConnectionInfo.status);
    });
}

// Function to update the TCP status display
function updateTcpStatus(status) {
    document.getElementById('tcpStatus').innerText = 'TCP Status: ' + status;
}

// Function to convert ASCII to HEX
function asciiToHex(str) {
    let hexString = '';
    let i = 0;

    while (i < str.length) {
        if (str[i] === '\\' && i + 2 < str.length) {
            // If the current character is a backslash, treat the next two characters as HEX
            const hexChar = str.substr(i + 1, 2); // Get the next two characters
            hexString += hexChar; // Append the HEX characters directly
            i += 3; // Move past the backslash and the two HEX characters
        } else {
            // Convert the ASCII character to HEX
            hexString += str[i].charCodeAt(0).toString(16);
            i++;
        }
    }

    return hexString; // Return the complete HEX string
}

// Function to display sent and received data
function displayData(asciiMessage, hexMessage, type) {
    const displayArea = document.getElementById('dataDisplay');
    const messageElement = document.createElement('div');
    
    // Create a formatted message with different styles
    messageElement.innerHTML = `
        <strong>${type === 'sent' ? 'Sent' : 'Received'}:</strong>
        <span style="color: ${type === 'sent' ? '#f08080' : 'green'};">${asciiMessage}</span>
        <span style="color: lightblue; font-style: italic;"> (HEX: ${hexMessage})</span>
    `;
    
    messageElement.style.borderBottom = '1px solid #ccc'; // Add a bottom border for separation
    messageElement.style.padding = '5px 0'; // Add some padding
    displayArea.appendChild(messageElement);

    // Save the displayed data to local storage
    const existingData = localStorage.getItem('displayedData') || '';
    localStorage.setItem('displayedData', existingData + messageElement.innerHTML + '<br>');
}

// Function to send HEX data to the connected TCP server/client
function sendHexData(hexData) {
    const byteArray = hexData.match(/.{1,2}/g).map(byte => parseInt(byte, 16)); // Convert hex string to byte array

    // Convert HEX to ASCII for display
    const asciiData = byteArray.map(byte => String.fromCharCode(byte)).join('');

    if (client && tcpConnectionInfo.status === 'Connected') {
        // If connected as a client, send data to the server
        client.write(Buffer.from(byteArray));
        displayData(asciiData, hexData, 'sent'); // Display sent data in both ASCII and HEX format
    } else if (server && tcpConnectionInfo.status === 'Connected') {
        // If connected as a server, send data to all connected clients
        clientsOfServer.forEach((clients) => {
            if (!clients.destroyed) {
                clients.write(Buffer.from(byteArray)); // Send data to each connected client
                displayData(asciiData, hexData, 'sent'); // Display sent data in both ASCII and HEX format
            }
        });
    } else {
        alert('No active TCP connection to send data.');
    }
}

// Set up event listeners for run.html
function setupRunPageListeners() {
    // Load saved data from local storage
    document.getElementById('asciiInput').value = localStorage.getItem('asciiInput') || '';
    document.getElementById('hexOutput').value = localStorage.getItem('hexOutput') || '';

    // Event listener for ASCII input
    document.getElementById('asciiInput').addEventListener('input', function() {
        const asciiValue = this.value;
        const hexValue = asciiToHex(asciiValue);
        document.getElementById('hexOutput').value = hexValue; // Update HEX output

        // Save to local storage
        localStorage.setItem('asciiInput', asciiValue);
        localStorage.setItem('hexOutput', hexValue);
    });

    // Event listener for send button
    document.getElementById('sendHexBtn').addEventListener('click', function() {
        const hexData = document.getElementById('hexOutput').value;
        sendHexData(hexData); // Send HEX data
    });

    // Event listener for clear log button
    document.getElementById('clearLogBtn').addEventListener('click', function() {
        document.getElementById('dataDisplay').innerHTML = ''; // Clear the data display area
        localStorage.removeItem('displayedData'); // Optionally clear the stored displayed data
    });

    // Event listener for the new checkbox
    const dumbCheckbox = document.getElementById('dumbIcashResponseCheckbox');
    if (dumbCheckbox) {
        dumbCheckbox.addEventListener('change', function() {
            isDumbIcashResponseEnabled = this.checked;
            console.log('Dumb ICash Response enabled:', isDumbIcashResponseEnabled);
        });
        // Initialize checkbox state (optional, could load from storage if needed)
        isDumbIcashResponseEnabled = dumbCheckbox.checked;
    }
}

// Function to load ISO configurations
function loadIsoConfigs() {
    const isoSelect = document.getElementById('isoSelect');

    // Get ISO configurations from the main process
    ipcRenderer.invoke('get-iso-configs').then(isoConfigs => {
        // Populate the dropdown with existing configurations
        Object.keys(isoConfigs).forEach(config => {
            const option = document.createElement('option');
            option.value = config;
            option.textContent = config;
            isoSelect.appendChild(option);
        });

        // Add event listener for dropdown change
        isoSelect.addEventListener('change', (event) => {
            const selectedConfig = event.target.value;
            populateConfigTable(selectedConfig);
        });

        // Load the first configuration by default if available
        if (isoSelect.options.length > 0) {
            isoSelect.value = isoSelect.options[0].value; // Select the first option
            populateConfigTable(isoSelect.value); // Populate the table with the first config
        }
    });
}

// Function to populate the configuration table
function populateConfigTable(configName) {
    const tableBody = document.querySelector('#configTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    ipcRenderer.invoke('get-iso-configs').then(isoConfigs => {
        const configData = isoConfigs[configName] || [];
        configData.forEach((field) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${field.bmpPosition}</td>
                <td>${field.lengthType}</td>
                <td>${field.dataType}</td>
                <td>${field.justification}</td>
                <td>${field.filler}</td>
                <td>${field.fieldName}</td>
                <td>${field.defaultValue}</td>
                <td>
                    <button class="editBtn">Edit</button>
                    <button class="deleteBtn">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        // Add event listeners for edit and delete buttons
        addRowEventListeners();
    });
}

// Function to add a new field
document.getElementById('addFieldBtn').addEventListener('click', () => {
    const newField = {
        bmpPosition: document.getElementById('bmpPositionInput').value,
        lengthType: document.getElementById('lengthTypeInput').value,
        dataType: document.getElementById('dataTypeInput').value,
        justification: document.getElementById('justificationInput').value,
        filler: document.getElementById('fillerInput').value,
        fieldName: document.getElementById('fieldNameInput').value,
        defaultValue: document.getElementById('defaultValueInput').value
    };
    const selectedConfig = document.getElementById('isoSelect').value;

    // Save the new field to the database
    ipcRenderer.invoke('save-iso-config', selectedConfig, newField).then(() => {
        populateConfigTable(selectedConfig); // Refresh the table
    });
});

// Function to add event listeners for edit and delete buttons
function addRowEventListeners() {
    const editButtons = document.querySelectorAll('.editBtn');
    const deleteButtons = document.querySelectorAll('.deleteBtn');

    editButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            // Implement edit functionality here
        });
    });

    deleteButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            // Implement delete functionality here
        });
    });
}