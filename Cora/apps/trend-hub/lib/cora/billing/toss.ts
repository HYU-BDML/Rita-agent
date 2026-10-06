/**
 * Toss Payments confirm adapter, TEST MODE ONLY. No network call happens unless a caller passes a key.
 * Contract (checked against docs.tosspayments.com/reference and /reference/using-api/authorization):
 *   POST https://api.tosspayments.com/v1/payments/confirm
 *   Authorization: Basic base64(secretKey + ':')   Content-Type: application/json
 *   body {paymentKey, orderId, amount}; payment.status 'DONE' = approved.
 * 확인 필요: the exact 4xx error `code` catalogue and the docs' claim that test secret keys begin with
 * `test_sk` were read from the docs pages, not exercised against the live test server in this build.
 * Outcomes: 200+DONE -> paid; 4xx -> failed (with code); network error / timeout / 5xx / unreadable body -> unknown.
 * `unknown` is never retried here: the caller must check the Toss dashboard before trying again.
 */
export type PaymentObservation = { status: 'paid' | 'failed' | 'unknown'; paymentKey?: string; orderId?: string; amount?: number; code?: string; message?: string; httpStatus?: number };
export type ConfirmInput = { paymentKey: string; orderId: string; amount: number };

export class TossPayments {
  constructor(private secretKey: string, private transport: typeof fetch = fetch, private host = 'https://api.tosspayments.com') {
    if (typeof secretKey !== 'string' || !secretKey.startsWith('test_')) throw new Error('이 버전은 토스페이먼츠 테스트 키(test_로 시작)만 사용할 수 있습니다. 실제 결제 키는 사용할 수 없습니다.');
  }
  async confirm(input: ConfirmInput): Promise<PaymentObservation> {
    const { paymentKey, orderId, amount } = input;
    if (typeof paymentKey !== 'string' || !paymentKey || paymentKey.length > 200 || typeof orderId !== 'string' || !orderId || !Number.isInteger(amount) || amount <= 0) throw new Error('결제 확인에는 paymentKey, orderId, 1원 이상의 정수 금액이 필요합니다.');
    let res: Response;
    try {
      res = await this.transport(`${this.host}/v1/payments/confirm`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(this.secretKey + ':').toString('base64'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentKey, orderId, amount }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) { return { status: 'unknown', code: 'NETWORK', message: `결제 결과를 확인하지 못했습니다(${e instanceof Error ? e.message : '네트워크 오류'}). 토스 결제 내역을 확인하기 전에는 다시 승인하지 마세요.` }; }
    let data: Record<string, unknown> = {};
    try { data = (await res.json()) as Record<string, unknown>; } catch { /* handled below by status */ }
    const httpStatus = res.status;
    if (httpStatus >= 500) return { status: 'unknown', httpStatus, code: String(data.code ?? 'SERVER_ERROR'), message: '토스페이먼츠 서버 오류로 결제 결과를 알 수 없습니다. 토스 결제 내역을 확인해 주세요.' };
    if (httpStatus >= 400) return { status: 'failed', httpStatus, code: String(data.code ?? 'REJECTED'), message: String(data.message ?? '결제가 승인되지 않았습니다.') };
    if (httpStatus === 200 && data.status === 'DONE') {
      const total = Number(data.totalAmount ?? amount);
      if (data.orderId !== undefined && data.orderId !== orderId || total !== amount) return { status: 'unknown', httpStatus, code: 'MISMATCH', message: '승인 응답의 주문번호 또는 금액이 요청과 다릅니다. 토스 결제 내역을 확인해 주세요.' };
      return { status: 'paid', httpStatus, paymentKey, orderId, amount: total };
    }
    if (httpStatus === 200 && ['ABORTED', 'EXPIRED', 'CANCELED'].includes(String(data.status))) return { status: 'failed', httpStatus, code: String(data.status), message: '결제가 승인되지 않았습니다.' };
    return { status: 'unknown', httpStatus, code: String(data.status ?? 'UNREADABLE'), message: '결제 상태를 확인하지 못했습니다. 토스 결제 내역을 확인해 주세요.' };
  }
}
