import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface TelegramAlertPayload {
    id?: string;
    isoCode: string;
    title: string;
    summary: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

async function sendTelegramMessage(text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) return false;

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: false,
            }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

function formatAlert(alert: TelegramAlertPayload): string {
    const emoji = alert.severity === 'HIGH' ? '🔴' : alert.severity === 'MEDIUM' ? '🟡' : '🟢';
    return [
        `${emoji} <b>AXIS AFRICA ALERT</b>`,
        ``,
        `<b>${alert.title}</b>`,
        `📍 Country: <code>${alert.isoCode}</code>`,
        `⚠️ Severity: <b>${alert.severity}</b>`,
        ``,
        alert.summary,
        ``,
        `🔗 <a href="https://axis-mocha.vercel.app?country=${alert.isoCode}">View on AXIS Africa</a>`,
    ].join('\n');
}

export async function POST(request: NextRequest) {
    // Check if Telegram is configured
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        return NextResponse.json(
            { error: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.' },
            { status: 503 }
        );
    }

    // Validate webhook secret
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
        const provided = request.headers.get('x-webhook-secret');
        if (provided !== secret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const body = await request.json();

        // Support both single alert and Supabase webhook payload formats
        let alerts: TelegramAlertPayload[] = [];

        if (body.type === 'INSERT' && body.record) {
            // Supabase webhook format
            alerts = [body.record as TelegramAlertPayload];
        } else if (body.alerts && Array.isArray(body.alerts)) {
            alerts = body.alerts;
        } else if (body.isoCode && body.title) {
            // Direct single alert
            alerts = [body as TelegramAlertPayload];
        } else {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Only send HIGH severity by default
        const highAlerts = alerts.filter(a => a.severity === 'HIGH');

        if (highAlerts.length === 0) {
            return NextResponse.json({ sent: 0, message: 'No HIGH severity alerts to send' });
        }

        let sent = 0;
        for (const alert of highAlerts) {
            const message = formatAlert(alert);
            const ok = await sendTelegramMessage(message);
            if (ok) sent++;
        }

        return NextResponse.json({ sent, total: highAlerts.length });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to process webhook' },
            { status: 500 }
        );
    }
}

// Health check
export async function GET() {
    const configured = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    return NextResponse.json({
        service: 'AXIS Africa Telegram Alerts',
        configured,
        message: configured
            ? 'Telegram bot is configured and ready.'
            : 'Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and optionally TELEGRAM_WEBHOOK_SECRET env vars to enable.',
    });
}
