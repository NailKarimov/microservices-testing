import { z } from 'zod';

/**
 * Contracts for the Sock Shop microservices, written from observed behaviour of the
 * Weaveworks demo images (the services publish no OpenAPI document).
 */
export const SHIPPING_FEE = 4.99;
/** The payment service declines every amount above this limit. */
export const PAYMENT_LIMIT = 100;

export const healthSchema = z.object({
  health: z.array(z.object({ service: z.string().min(1), status: z.literal('OK') })).min(1),
});

export const paymentAuthSchema = z.object({
  authorised: z.boolean(),
  message: z.string().min(1),
});

/** Error body of the Go services (payment, user, catalogue). */
export const goErrorSchema = z.object({
  error: z.string().min(1),
  status_code: z.number().int(),
  status_text: z.string().min(1),
});

/** Error body of the Spring services (carts, orders, shipping). */
export const springErrorSchema = z.object({
  timestamp: z.number(),
  status: z.number().int(),
  error: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1),
});

export const sockSchema = z.object({
  id: z.string().regex(/^[0-9a-z]{8}(-[0-9a-z]{4}){3}-[0-9a-z]{12}$/),
  name: z.string().min(1),
  description: z.string(),
  imageUrl: z.array(z.string()).min(1),
  price: z.number().positive(),
  count: z.number().int().min(0),
  tag: z.array(z.string()),
});
export type Sock = z.infer<typeof sockSchema>;

export const sockListSchema = z.array(sockSchema);
export const catalogueSizeSchema = z.object({ size: z.number().int().min(0), err: z.null() });
export const tagsSchema = z.object({ tags: z.array(z.string().min(1)).min(1), err: z.null() });

const objectId = z.string().regex(/^[0-9a-f]{24}$/);

export const idSchema = z.object({ id: objectId });

export const loginSchema = z.object({
  user: z.object({ username: z.string().min(1), id: objectId }),
});

export const cardListSchema = z.object({
  _embedded: z.object({
    card: z.array(z.object({ longNum: z.string(), expires: z.string(), ccv: z.string(), id: objectId })),
  }),
});

export const addressListSchema = z.object({
  _embedded: z.object({
    address: z.array(
      z.object({
        street: z.string(),
        number: z.string(),
        country: z.string(),
        city: z.string(),
        postcode: z.string(),
        id: objectId,
      }),
    ),
  }),
});

export const cartItemSchema = z.object({
  id: objectId,
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number(),
});
export const cartItemsSchema = z.array(cartItemSchema);

export const orderSchema = z.object({
  id: objectId,
  customerId: objectId,
  items: z.array(cartItemSchema.omit({ id: true }).extend({ id: objectId.optional() })),
  shipment: z.object({ id: z.string().uuid(), name: z.string().min(1) }),
  date: z.string().min(1),
  total: z.number(),
});
export type Order = z.infer<typeof orderSchema>;

/** An order read back by id: the stored document has no `id` or `shipment.id`, only a self link. */
export const storedOrderSchema = z.object({
  customerId: objectId,
  items: z.array(
    z.object({ itemId: z.string().min(1), quantity: z.number().int().positive(), unitPrice: z.number() }),
  ),
  shipment: z.object({ name: z.string().min(1) }),
  total: z.number(),
  date: z.string().min(1),
  _links: z.object({ self: z.object({ href: z.string().url() }) }),
});

/** Tags are a set: the services return them in a different order on every call. */
export function normaliseSocks<T extends { id: string; tag: string[] }>(socks: T[]): T[] {
  return socks.map((s) => ({ ...s, tag: [...s.tag].sort() })).sort((a, b) => a.id.localeCompare(b.id));
}

export const customerOrdersSchema = z.object({
  _embedded: z.object({ customerOrders: z.array(z.object({ customerId: objectId, total: z.number() })) }),
});
