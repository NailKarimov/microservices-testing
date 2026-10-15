// The full user journey the payment flow depends on: register → add an address and a card →
// add the cheapest sock to the cart → place the order. Writes real data on every iteration (one
// customer, one order), so it runs at far lower concurrency than catalogue-browse.js — see
// loadtests/lib/profiles.js for the "checkout" tier.
//
// `customer`/`address`/`card`/`items` below must stay the internal service hostnames (`user`,
// `carts`): the orders service itself resolves them from inside the Docker network, regardless
// of which URL this script used to reach those services.
//
// Run from the repo root: `node scripts/run-k6.mjs checkout <smoke|load|stress>`.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { profile } from './lib/profiles.js';

const CATALOGUE_URL = __ENV.CATALOGUE_URL || 'http://catalogue';
const CARTS_URL = __ENV.CARTS_URL || 'http://carts';
const ORDERS_URL = __ENV.ORDERS_URL || 'http://orders';
const USER_URL = __ENV.USER_URL || 'http://user';

export const options = profile('checkout');

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };
const postJson = (url, body) => http.post(url, JSON.stringify(body), JSON_HEADERS);

function cheapestSock() {
  const socks = http.get(`${CATALOGUE_URL}/catalogue?size=1000`).json();
  return socks.reduce((cheapest, sock) => (sock.price < cheapest.price ? sock : cheapest));
}

export default function () {
  const username = `k6_${__VU}_${__ITER}_${Date.now()}`;
  const register = postJson(`${USER_URL}/register`, {
    username,
    password: 'secret123',
    email: `${username}@example.com`,
  });
  if (!check(register, { 'register → 200': (r) => r.status === 200 })) return;
  const customerId = register.json('id');

  const address = postJson(`${USER_URL}/addresses`, {
    userID: customerId,
    street: 'Load test',
    number: '1',
    country: 'LV',
    city: 'Riga',
    postcode: 'LV-1010',
  });
  const card = postJson(`${USER_URL}/cards`, {
    userID: customerId,
    longNum: '4111111111111111',
    expires: '12/30',
    ccv: '123',
  });
  if (!check(address, { 'address → 200': (r) => r.status === 200 })) return;
  if (!check(card, { 'card → 200': (r) => r.status === 200 })) return;
  const addressId = address.json('id');
  const cardId = card.json('id');

  const sock = cheapestSock();
  const addedToCart = postJson(`${CARTS_URL}/carts/${customerId}/items`, {
    itemId: sock.id,
    unitPrice: sock.price,
  });
  if (!check(addedToCart, { 'add to cart → 201': (r) => r.status === 201 })) return;

  const order = postJson(`${ORDERS_URL}/orders`, {
    customer: `http://user/customers/${customerId}`,
    address: `http://user/addresses/${addressId}`,
    card: `http://user/cards/${cardId}`,
    items: `http://carts/carts/${customerId}/items`,
  });
  check(order, { 'order → 201': (r) => r.status === 201 });

  sleep(1);
}
