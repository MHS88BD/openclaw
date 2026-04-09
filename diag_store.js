const Baileys = require('@whiskeysockets/baileys');
console.log('Baileys Keys:', Object.keys(Baileys));
if (Baileys.makeInMemoryStore) {
    console.log('makeInMemoryStore found in main export');
} else {
    try {
        const Store = require('@whiskeysockets/baileys/lib/Store');
        console.log('Store Keys:', Object.keys(Store));
        if (Store.makeInMemoryStore) console.log('makeInMemoryStore found in /lib/Store');
    } catch (e) {
        console.log('/lib/Store not found');
    }
}
