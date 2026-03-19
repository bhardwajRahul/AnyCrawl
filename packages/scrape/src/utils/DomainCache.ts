import * as IORedis from "ioredis";

let sharedRedis: IORedis.Redis | null = null;
function getRedis(): IORedis.Redis {
    if (!sharedRedis) {
        sharedRedis = new IORedis.default(process.env.ANYCRAWL_REDIS_URL, {
            maxRetriesPerRequest: null,
            lazyConnect: true,
        });
    }
    return sharedRedis;
}

export class DomainCache<T> {
    private readonly local = new Map<string, { value: T; ts: number }>();

    constructor(
        private readonly prefix: string,
        private readonly redisTtl = 86400,
        private readonly localTtl = 300_000,
    ) {}

    async get(domain: string): Promise<T | null> {
        const l = this.local.get(domain);
        if (l && Date.now() - l.ts < this.localTtl) return l.value;
        try {
            const raw = await getRedis().get(`${this.prefix}:${domain}`);
            if (!raw) return null;
            const value = JSON.parse(raw) as T;
            this.local.set(domain, { value, ts: Date.now() });
            return value;
        } catch {
            return null;
        }
    }

    async set(domain: string, value: T): Promise<void> {
        try {
            await getRedis().set(
                `${this.prefix}:${domain}`,
                JSON.stringify(value),
                "EX",
                this.redisTtl,
            );
            this.local.set(domain, { value, ts: Date.now() });
        } catch {
            // fire-and-forget
        }
    }
}
