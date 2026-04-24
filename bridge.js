(function() {
    // Check if we are in Capacitor
    const isCapacitor = window.hasOwnProperty('Capacitor');

    if (!isCapacitor) {
        console.log('Not in Capacitor environment. Bridge skipping.');
        return;
    }

    const { Preferences } = Capacitor.Plugins;
    // Note: Http plugin might be under Capacitor.Plugins.Http or Capacitor.Plugins.CapacitorHttp
    const Http = Capacitor.Plugins.Http || Capacitor.Plugins.CapacitorHttp;

    window.api = {
        getCommands: async () => {
            const { value } = await Preferences.get({ key: 'commands' });
            return value ? JSON.parse(value) : [];
        },
        saveCommands: async (commands) => {
            await Preferences.set({ key: 'commands', value: JSON.stringify(commands) });
            return { success: true };
        },
        getAutoLaunch: async () => {
            return false; // Not supported on Android
        },
        setAutoLaunch: async (enabled) => {
            return { success: true }; // Stub
        },
        parseCurl: async (curlString) => {
            try {
                // Simple regex-based parser for Android/Web context
                const urlMatch = curlString.match(/'(http.*?)'/) || curlString.match(/"(http.*?)"/);
                const url = urlMatch ? urlMatch[1] : "";
                
                let method = "GET";
                if (curlString.includes("-X POST") || curlString.includes("--data") || curlString.includes("-d ")) {
                    method = "POST";
                }
                
                const headers = {};
                // Improved header regex to handle different quotes and formats
                const headerRegex = /-H\s+['"](.*?):\s+(.*?)['"]/g;
                let match;
                while ((match = headerRegex.exec(curlString)) !== null) {
                    headers[match[1]] = match[2];
                }

                const bodyMatch = curlString.match(/--data(-raw|-binary)?\s+['"](.*?)['"]/) || curlString.match(/-d\s+['"](.*?)['"]/);
                const body = bodyMatch ? bodyMatch[2] : undefined;

                return { 
                    success: true, 
                    data: { url, method, headers, body } 
                };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },
        openExternal: (url) => {
            window.open(url, '_blank');
            return { success: true };
        },
        executeRequest: async (cmd) => {
            try {
                const startTime = Date.now();
                
                // Use Capacitor Http for native network access (bypasses CORS)
                const options = {
                    url: cmd.url,
                    method: cmd.method,
                    headers: {
                        ...cmd.headers,
                        'User-Agent': cmd.headers['User-Agent'] || cmd.headers['user-agent'] || 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
                    },
                    data: cmd.method !== 'GET' ? cmd.body : undefined,
                    connectTimeout: 10000,
                    readTimeout: 10000
                };

                const response = await Http.request(options);
                const duration = Date.now() - startTime;

                return {
                    success: true,
                    status: response.status,
                    data: typeof response.data === 'object' ? JSON.stringify(response.data) : response.data,
                    duration: duration
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    };

    console.log('Capacitor Bridge Initialized');
})();
