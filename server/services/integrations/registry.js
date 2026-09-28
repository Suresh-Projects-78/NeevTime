/**
 * Integration registry — the single list of every HRMS/payroll service this
 * app can connect to.
 *
 * Adding a service used to mean editing four places: a constant in
 * INTEGRATION_TYPE, a pair of cases in the getIntegrationInstance switch, an
 * entry in the /integration-types picker route, and (if you remembered) a
 * capability list. Miss one and the adapter silently misbehaves. This registry
 * is that one place: the resolver, the picker and the capability checks all
 * read from it, so they cannot disagree.
 *
 * To add a service:
 *   1. write the adapter in ./<name>.js, extending BaseIntegration, declaring
 *      `static capabilities` for what it genuinely implements;
 *   2. add one entry below;
 *   3. run the conformance test (test/integration-registry.test.js).
 */

const ADAPTERS = [
    {
        type: 'erpnext',
        name: 'ERPNext / Frappe HR',
        description: 'Open source ERP with a full HR module.',
        load: () => require('./erpnext'),
        aliases: [],
        required_fields: ['base_url', 'api_key', 'api_secret'],
        config_fields: [],
        icon: '🧾', color: '#0089FF',
    },
    {
        type: 'odoo',
        name: 'Odoo',
        description: 'Open source ERP. Employees and attendance.',
        load: () => require('./odoo'),
        aliases: [],
        required_fields: ['base_url', 'username', 'password'],
        config_fields: ['database_name'],
        icon: '🟣', color: '#875A7B',
    },
    {
        type: 'horilla',
        name: 'Horilla',
        description: 'Open source HRMS. Employees and attendance.',
        load: () => require('./horilla'),
        aliases: [],
        required_fields: ['base_url', 'username', 'password'],
        config_fields: [],
        icon: '🌿', color: '#4CAF50',
    },
    {
        type: 'greythr',
        name: 'greytHR',
        description: 'Cloud HR/payroll (India). Pushes raw attendance swipes via the RSA Attendance Swipe API.',
        load: () => require('./greythr'),
        aliases: [],
        required_fields: ['base_url'],
        config_fields: ['domain', 'api_id', 'private_key'],
        icon: '🕒', color: '#F5821F',
    },
    {
        type: 'sap_successfactors',
        name: 'SAP SuccessFactors',
        description: 'Enterprise HCM suite.',
        load: () => require('./sap-successfactors'),
        aliases: ['sap'],
        required_fields: ['base_url', 'username', 'password'],
        config_fields: ['company_id', 'api_version'],
        icon: '🔷', color: '#0FAAFF',
    },
    {
        type: 'workday',
        name: 'Workday',
        description: 'Enterprise HCM and finance.',
        load: () => require('./workday'),
        aliases: [],
        required_fields: ['base_url', 'username', 'password'],
        config_fields: ['tenant'],
        icon: '🟠', color: '#F38B00',
    },
    {
        type: 'bamboohr',
        name: 'BambooHR',
        description: 'SMB HR platform.',
        load: () => require('./bamboohr'),
        aliases: [],
        required_fields: ['api_key'],
        config_fields: ['subdomain'],
        icon: '🎋', color: '#8DC63F',
    },
    {
        type: 'zoho_people',
        name: 'Zoho People',
        description: 'Zoho HR suite.',
        load: () => require('./zoho-people'),
        aliases: ['zoho'],
        required_fields: ['api_key'],
        config_fields: ['refresh_token', 'accounts_url'],
        icon: '🟢', color: '#E42527',
    },
    {
        type: 'generic_rest',
        name: 'Generic REST API',
        description: 'Config-driven adapter for any REST HRMS: set auth, endpoint paths and a field map — no new code.',
        load: () => require('./generic-rest'),
        aliases: ['rest'],
        required_fields: ['base_url'],
        config_fields: ['auth', 'endpoints', 'fieldMap'],
        icon: '🔌', color: '#334155',
    },
    {
        type: 'webhook',
        name: 'Generic Webhook / API',
        description: 'Any system that can post JSON. The way to connect a vendor with a closed API.',
        load: () => require('./webhook'),
        aliases: ['custom_api'],
        required_fields: ['base_url'],
        config_fields: [],
        icon: '🔗', color: '#64748B',
    },
];

const byType = new Map();
for (const entry of ADAPTERS) {
    byType.set(entry.type, entry);
    for (const alias of entry.aliases || []) byType.set(alias, entry);
}

/** The adapter entry for a stored integration type, or undefined. */
const find = (type) => byType.get(String(type || '').trim().toLowerCase());

/** Capabilities read off the adapter class, so the two never diverge. */
const capabilitiesOf = (entry) => {
    try {
        const Adapter = entry.load();
        return Adapter.capabilities || [];
    } catch (e) {
        return [];
    }
};

/** Every service, with its real capabilities. For the /integration-types picker. */
const list = () => ADAPTERS.map(entry => ({
    type: entry.type,
    name: entry.name,
    description: entry.description,
    required_fields: entry.required_fields,
    config_fields: entry.config_fields || [],
    icon: entry.icon,
    color: entry.color,
    capabilities: capabilitiesOf(entry),
}));

module.exports = { ADAPTERS, find, list, capabilitiesOf };
