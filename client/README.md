# Multi-PC System Monitoring Client

This is the client script that monitors system resources on individual PCs and sends the data to the backend server for the Multi-PC System Monitoring Dashboard.

## Features

- **Real-time Monitoring** - Collects CPU, RAM, and Disk usage every 5 seconds
- **Automatic Transmission** - Sends data to backend server automatically
- **Error Handling** - Robust retry logic and error recovery
- **Configurable** - Customizable settings via environment variables
- **Cross-platform** - Works on Windows, macOS, and Linux
- **Graceful Shutdown** - Proper cleanup on exit signals
- **Detailed Logging** - Comprehensive logging with timestamps

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Backend server running and accessible

## Installation

1. Navigate to the client-script directory:
   ```bash
   cd client-script
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file (optional):
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your configuration
   SERVER_URL=http://localhost:5000/api/systemdata
   PC_ID=MyPC-001
   COLLECTION_INTERVAL=5000
   VERBOSE=true
   ```

## Running the Client

### Basic Usage
```bash
npm start
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Custom Configuration
```bash
# Custom server URL and PC ID
PC_ID=Office-PC-01 SERVER_URL=http://192.168.1.100:5000/api/systemdata node client.js

# Verbose logging with custom interval
VERBOSE=true COLLECTION_INTERVAL=10000 node client.js

# Production settings
PC_ID=Production-Server-01 SERVER_URL=https://monitoring.company.com/api/systemdata node client.js
```

## Configuration

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SERVER_URL` | Backend server API endpoint | `http://localhost:5000/api/systemdata` | `http://192.168.1.100:5000/api/systemdata` |
| `COLLECTION_INTERVAL` | Data collection interval in milliseconds | `5000` | `10000` (10 seconds) |
| `PC_ID` | Unique identifier for this PC | Hostname | `Office-PC-01` |
| `MAX_RETRIES` | Maximum retry attempts for failed requests | `3` | `5` |
| `RETRY_DELAY` | Delay between retries in milliseconds | `5000` | `3000` |
| `MAX_OFFLINE_TIME` | Max time to run without server connection | `300000` (5 min) | `600000` (10 min) |
| `VERBOSE` | Enable verbose logging | `false` | `true` |

### Configuration Examples

#### Basic Home Setup
```bash
PC_ID=Home-Desktop
SERVER_URL=http://192.168.1.100:5000/api/systemdata
COLLECTION_INTERVAL=5000
VERBOSE=false
```

#### Office Environment
```bash
PC_ID=Office-Workstation-01
SERVER_URL=http://monitoring-server:5000/api/systemdata
COLLECTION_INTERVAL=10000
MAX_RETRIES=5
VERBOSE=true
```

#### Production Server
```bash
PC_ID=Production-Server-01
SERVER_URL=https://monitoring.company.com/api/systemdata
COLLECTION_INTERVAL=30000
MAX_RETRIES=3
MAX_OFFLINE_TIME=600000
VERBOSE=false
```

## Monitored Data

The client collects and sends the following system information:

### System Metrics
- **CPU Usage** - Current CPU load percentage (0-100%)
- **RAM Usage** - Memory usage percentage (0-100%)
- **Disk Usage** - Disk space usage percentage (0-100%)
- **System Uptime** - System uptime in seconds
- **Operating System** - OS name, version, and architecture

### Data Format
```json
{
  "pcId": "MyPC-001",
  "cpu": 45.2,
  "ram": 67.8,
  "disk": 23.1,
  "os": "Windows 10 Pro 10.0.19042 x64",
  "uptime": 86400
}
```

## Error Handling

### Retry Logic
- Automatic retry on failed requests
- Exponential backoff between retries
- Configurable maximum retry attempts
- Network timeout handling

### Offline Handling
- Continues running when server is temporarily unavailable
- Configurable maximum offline time
- Graceful shutdown after extended offline period
- Final data transmission on shutdown

### Error Types
- **Network Errors** - Connection timeouts, DNS failures
- **Server Errors** - HTTP error responses
- **System Errors** - Permission issues, resource access problems
- **Data Errors** - Invalid system information

## Logging

### Log Levels
- **INFO** - Normal operation messages
- **WARN** - Warning conditions (retries, temporary failures)
- **ERROR** - Error conditions (failures, exceptions)

### Log Format
```
[2023-09-13T10:30:45.123Z] [INFO] Starting Multi-PC System Monitoring Client
[2023-09-13T10:30:45.124Z] [INFO] Configuration: {"serverUrl":"http://localhost:5000/api/systemdata","pcId":"MyPC-001"}
[2023-09-13T10:30:50.456Z] [INFO] Data sent successfully {"status":201,"pcId":"MyPC-001","cpu":45.2,"ram":67.8,"disk":23.1}
```

### Verbose Mode
Enable verbose logging to see detailed information:
```bash
VERBOSE=true node client.js
```

## Running as a Service

### Windows (using PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start the client as a service
pm2 start client.js --name "pc-monitoring"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Linux/macOS (using PM2)
```bash
# Install PM2 globally
npm install -g pm2

# Start the client as a service
pm2 start client.js --name "pc-monitoring"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Windows Service (using node-windows)
```bash
# Install node-windows
npm install -g node-windows

# Create service script
node install-service.js
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   ```
   Error: connect ECONNREFUSED 127.0.0.1:5000
   ```
   - Ensure backend server is running
   - Check SERVER_URL configuration
   - Verify network connectivity

2. **Permission Denied**
   ```
   Error: EACCES: permission denied
   ```
   - Run with appropriate permissions
   - Check file system permissions
   - Run as administrator (Windows) or with sudo (Linux/macOS)

3. **High CPU Usage**
   - Increase COLLECTION_INTERVAL
   - Check for system resource issues
   - Monitor system performance

4. **Data Not Appearing in Dashboard**
   - Check server connectivity
   - Verify PC_ID is unique
   - Check backend server logs
   - Enable verbose logging

### Debug Mode
Enable verbose logging for detailed debugging:
```bash
VERBOSE=true node client.js
```

### Health Check
The client includes built-in health monitoring:
- Server connectivity tests
- Data transmission status
- Error count tracking
- Uptime monitoring

## Security Considerations

### Network Security
- Use HTTPS in production environments
- Implement proper firewall rules
- Consider VPN for remote monitoring

### Data Privacy
- System information is transmitted to the monitoring server
- No personal data is collected
- Consider data retention policies

### Access Control
- Ensure proper authentication on the backend
- Use secure API endpoints
- Implement proper authorization

## Performance

### Resource Usage
- Minimal CPU overhead (< 1% typically)
- Low memory footprint (~20-50MB)
- Minimal network bandwidth usage

### Optimization
- Adjust collection interval based on needs
- Monitor system performance impact
- Use appropriate retry settings

## Integration

### Multiple PCs
Run the client on multiple PCs with unique PC_ID values:
```bash
# PC 1
PC_ID=Office-PC-01 node client.js

# PC 2
PC_ID=Office-PC-02 node client.js

# PC 3
PC_ID=Office-PC-03 node client.js
```

### Automated Deployment
Use configuration management tools:
- Ansible
- Puppet
- Chef
- PowerShell DSC

## License

MIT License - see main project README for details.
