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
                // Even more robust method detection (supports various quote styles and case sensitivity)
                if (curlString.match(/-X\s+['"]?(POST|PUT|PATCH)['"]?/i) || 
                    curlString.includes("--data") || 
                    curlString.includes("-d ") ||
                    curlString.includes("--data-raw")) {
                    method = "POST";
                }
                
                const headers = {};
                // Improved header regex to handle different quotes properly
                const headerRegex = /-H\s+(?:'([^']*)'|"([^"]*)")/g;
                let match;
                while ((match = headerRegex.exec(curlString)) !== null) {
                    const h = match[1] || match[2];
                    if (h) {
                        const parts = h.split(/:\s*(.*)/);
                        if (parts.length >= 2) headers[parts[0]] = parts[1];
                    }
                }

                // Correctly capture body by matching the same type of quote at start and end
                const bodyMatch = curlString.match(/--data(?:-raw|-binary)?\s+'([^']*)'/) || 
                                 curlString.match(/--data(?:-raw|-binary)?\s+"([^"]*)"/) ||
                                 curlString.match(/-d\s+'([^']*)'/) ||
                                 curlString.match(/-d\s+"([^"]*)"/);
                
                const body = bodyMatch ? (bodyMatch[1] || bodyMatch[2]) : undefined;

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
                
                // Filter out problematic headers that should be handled by the native client
                const safeHeaders = { ...cmd.headers };
                const headersToRemove = [
                    'Content-Length', 'content-length',
                    'Accept-Encoding', 'accept-encoding',
                    'Connection', 'connection',
                    'Host', 'host' // Native engine handles Host header automatically
                ];
                headersToRemove.forEach(h => delete safeHeaders[h]);

                // Safety: If there is a body, it must be a POST/PUT request
                let method = (cmd.method || 'GET').toUpperCase();
                if (cmd.body && method === 'GET') {
                    method = 'POST';
                }

                // If on Android, sometimes specific mobile User-Agents work better
                const userAgent = safeHeaders['User-Agent'] || safeHeaders['user-agent'] || 
                                 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

                // Special handling for JSON bodies on Android/Capacitor
                let requestData = method !== 'GET' ? cmd.body : undefined;
                if (requestData && typeof requestData === 'string' && 
                    (safeHeaders['Content-Type'] || '').includes('application/json')) {
                    try {
                        // If it's a JSON string, parsing it to an object often works better with CapacitorHttp
                        requestData = JSON.parse(requestData);
                    } catch (e) {
                        // Not valid JSON, send as is
                    }
                }

                const options = {
                    url: cmd.url,
                    method: method,
                    headers: {
                        ...safeHeaders,
                        'User-Agent': userAgent
                    },
                    data: requestData,
                    connectTimeout: 30000,
                    readTimeout: 30000,
                    disableCookies: false 
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
                return { success: false, error: error.message };
            }
        },

        // --- Auth Methods for Mobile ---
        authCheck: async (cafeId, hwidOverride) => {
            const hwid = hwidOverride || await window.api.getHWID();
            if (hwidOverride) await Preferences.set({ key: 'hwid', value: hwidOverride });

            // Bypass for master user
            if (cafeId === 'krazyeom그래염') {
                await Preferences.set({ key: 'is_authorized', value: 'true' });
                await Preferences.set({ key: 'cafe_id', value: cafeId });
                return { status: 'APPROVED', data: { cafe_id: cafeId, hwid: hwid, is_approved: true } };
            }

            const { data, error } = await supabaseClient
                .from('licenses')
                .select('*')
                .eq('cafe_id', cafeId)
                .eq('hwid', hwid)
                .single();

            if (error || !data) return { status: 'NOT_FOUND', hwid };
            if (data.is_approved) {
                await Preferences.set({ key: 'is_authorized', value: 'true' });
                await Preferences.set({ key: 'cafe_id', value: cafeId });
                return { status: 'APPROVED', data };
            }
            return { status: 'PENDING', data };
        },
        authRequest: async (cafeId, hwidOverride) => {
            const hwid = hwidOverride || await window.api.getHWID();
            if (hwidOverride) await Preferences.set({ key: 'hwid', value: hwidOverride });

            // Bypass for master user
            if (cafeId === 'krazyeom그래염') {
                await Preferences.set({ key: 'is_authorized', value: 'true' });
                await Preferences.set({ key: 'cafe_id', value: cafeId });
                return { success: true };
            }

            const { data, error } = await supabaseClient
                .from('licenses')
                .upsert([{ cafe_id: cafeId, hwid: hwid, is_approved: false }], { onConflict: 'cafe_id,hwid' });
            
            if (error) return { success: false, message: error.message };
            return { success: true };
        },
        getStoredAuth: async () => {
            const isAuth = await Preferences.get({ key: 'is_authorized' });
            const cId = await Preferences.get({ key: 'cafe_id' });
            const hwid = await window.api.getHWID();
            return {
                isAuthorized: isAuth.value === 'true',
                cafeId: cId.value || '',
                hwid: hwid
            };
        },
        logoutAuth: async () => {
            await Preferences.remove({ key: 'is_authorized' });
            await Preferences.remove({ key: 'cafe_id' });
            await Preferences.remove({ key: 'hwid' });
            return { success: true };
        },
        getHWID: async () => {
            const stored = await Preferences.get({ key: 'hwid' });
            if (stored.value) return stored.value;

            const { Device } = Capacitor.Plugins;
            const info = await Device.getId();
            return info.identifier; // Unique device ID for Android/iOS
        },
        getProxy: async () => {
            const { value } = await Preferences.get({ key: 'proxy-url' });
            return value || '';
        },
        setProxy: async (url) => {
            await Preferences.set({ key: 'proxy-url', value: url });
            return { success: true };
        }
    };

    // Initialize Supabase for Mobile
    const SUPABASE_URL = 'https://fdcmiqwbihbubsrjhwxy.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_BeiX5hATlw17EqyFw0aiBw_8twbWoYa';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('Capacitor Bridge Initialized with Auth');
})();
