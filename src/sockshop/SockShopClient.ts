import { ApiClient, ApiResult } from '../api/ApiClient';
import { env } from '../../config/env';

export type Checkout = { customerId: string; addressId: string; cardId: string; username: string };

/**
 * Sock Shop talks to every microservice directly (one localhost port each) and also through the
 * edge router, which is what a browser uses. Absolute URLs bypass the Playwright `baseURL`.
 */
export class SockShopClient {
  readonly urls = env.sockShop;

  constructor(readonly api: ApiClient) {}

  /* ---------- payment ---------- */
  health(service: keyof typeof env.sockShop): Promise<ApiResult> {
    return this.api.get(`${this.urls[service]}/health`);
  }
  authorisePayment(amount: unknown): Promise<ApiResult> {
    return this.api.post(`${this.urls.payment}/paymentAuth`, { body: { amount } });
  }
  authorisePaymentRaw(data: string, contentType = 'application/json'): Promise<ApiResult> {
    return this.api.post(`${this.urls.payment}/paymentAuth`, { raw: { data, contentType } });
  }

  /* ---------- catalogue ---------- */
  catalogue(query: Record<string, string | number> = {}): Promise<ApiResult> {
    return this.api.get(`${this.urls.catalogue}/catalogue`, query);
  }
  sock(id: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.catalogue}/catalogue/${id}`);
  }
  catalogueSize(query: Record<string, string> = {}): Promise<ApiResult> {
    return this.api.get(`${this.urls.catalogue}/catalogue/size`, query);
  }
  tags(): Promise<ApiResult> {
    return this.api.get(`${this.urls.catalogue}/tags`);
  }

  /* ---------- user ---------- */
  register(username: string, password: string): Promise<ApiResult> {
    return this.api.post(`${this.urls.user}/register`, {
      body: { username, password, email: `${username}@example.com` },
    });
  }
  login(username: string, password: string): Promise<ApiResult> {
    const basic = Buffer.from(`${username}:${password}`).toString('base64');
    return this.api.send('GET', `${this.urls.user}/login`, { headers: { Authorization: `Basic ${basic}` } });
  }
  addAddress(customerId: string): Promise<ApiResult> {
    return this.api.post(`${this.urls.user}/addresses`, {
      body: {
        userID: customerId,
        street: 'Brivibas',
        number: '1',
        country: 'Latvia',
        city: 'Riga',
        postcode: 'LV-1010',
      },
    });
  }
  addCard(customerId: string, longNum = '4111111111111111'): Promise<ApiResult> {
    return this.api.post(`${this.urls.user}/cards`, {
      body: { userID: customerId, longNum, expires: '12/30', ccv: '123' },
    });
  }
  cards(customerId: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.user}/customers/${customerId}/cards`);
  }
  addresses(customerId: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.user}/customers/${customerId}/addresses`);
  }

  /* ---------- carts ---------- */
  addToCart(customerId: string, itemId: string, unitPrice: number): Promise<ApiResult> {
    return this.api.post(`${this.urls.carts}/carts/${customerId}/items`, { body: { itemId, unitPrice } });
  }
  cartItems(customerId: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.carts}/carts/${customerId}/items`);
  }
  removeFromCart(customerId: string, itemId: string): Promise<ApiResult> {
    return this.api.delete(`${this.urls.carts}/carts/${customerId}/items/${itemId}`);
  }
  clearCart(customerId: string): Promise<ApiResult> {
    return this.api.delete(`${this.urls.carts}/carts/${customerId}`);
  }

  /* ---------- orders ---------- */
  /** The orders service resolves these links inside the Docker network (hosts `user` and `carts`). */
  placeOrder(c: Checkout): Promise<ApiResult> {
    return this.api.post(`${this.urls.orders}/orders`, {
      body: {
        customer: `http://user/customers/${c.customerId}`,
        address: `http://user/addresses/${c.addressId}`,
        card: `http://user/cards/${c.cardId}`,
        items: `http://carts/carts/${c.customerId}/items`,
      },
    });
  }
  ordersOf(customerId: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.orders}/orders/search/customerId`, { custId: customerId });
  }
  order(id: string): Promise<ApiResult> {
    return this.api.get(`${this.urls.orders}/orders/${id}`);
  }

  /* ---------- scenario helpers ---------- */
  /** A new customer with one address and one card, ready to check out. */
  async newCustomer(): Promise<Checkout> {
    const username = `qa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const reg = await this.register(username, 'secret123');
    const customerId = (reg.body as { id: string }).id;
    const addressId = ((await this.addAddress(customerId)).body as { id: string }).id;
    const cardId = ((await this.addCard(customerId)).body as { id: string }).id;
    return { customerId, addressId, cardId, username };
  }
}
