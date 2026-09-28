/**
 * Adapter template — copy this to <vendor>.js to add a new HRMS/payroll vendor.
 *
 * Onboarding checklist (answer these, they map straight to the code below):
 *   1. Protocol?  REST / OAuth2 / SOAP / SDK / file-SFTP / webhook
 *   2. Direction? push / pull / both
 *   3. Auth?      api key / OAuth2 / RSA-sign / basic / bearer token
 *   4. Data?      employees / attendance / leave / shifts
 *   5. Gating?    plan tier, rate limits, partner approval
 *
 * Then:
 *   - declare `static capabilities` for what you ACTUALLY implement,
 *   - implement only those methods (leave the rest off — do not fake support),
 *   - add ONE entry to registry.js,
 *   - run: node test/integration-registry.test.js
 *
 * If the vendor is a plain REST API that only differs in endpoints/fields, you
 * probably don't need a class at all — configure the generic webhook adapter.
 */

const { BaseIntegration, CAPABILITY } = require('../hrms-integration');

class TemplateIntegration extends BaseIntegration {
    // Only list what you implement. The UI hides everything you don't declare.
    static capabilities = [
        // CAPABILITY.PUSH_ATTENDANCE,
        // CAPABILITY.PULL_EMPLOYEES,
    ];

    constructor(config) {
        super(config);
        // this.baseUrl, this.apiKey, this.apiSecret, this.username, this.password,
        // this.config (the jsonb blob) are set by BaseIntegration.
    }

    // Required for every adapter.
    async testConnection() {
        throw new Error('testConnection not implemented');
    }

    // Implement ONLY the ones in `capabilities`:
    // async pushAttendance(records) { /* returns { processed, success, failed } */ }
    // async pullEmployees() { /* returns employee[] */ }
    // async pullLeave() { /* returns leave[] */ }
}

module.exports = TemplateIntegration;
