// The offline queue's data (src/offline). Pure types, shared by the queue, the sync engine and the screens.

export type OpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * What the queue knows how to send. `kind` groups operations for the screens ("show my leave requests that are still
 * on the phone"); new kinds can be added freely, the sync engine never looks at it.
 */
export type OpKind =
  | 'leave.apply'
  | 'casualLeave.apply'
  | 'permission.submit'
  | 'missingPunch.submit'
  | 'outpass.submit'
  | 'compensation.claim'
  | 'compensation.use'
  | 'enquiry.submit'
  | 'hrTicket.submit'
  | 'request.withdraw'
  | 'onDuty.request'
  | 'onDuty.punch'
  | 'onDuty.end'
  | 'onDuty.otPunch'
  | (string & {});

/** A file to send as one multipart field (a selfie of an On-Duty punch). `uri` is a copy the queue owns. */
export interface OpFile {
  field: string;
  uri: string;
  name: string;
  type: string;
}

export type OpStatus = 'pending' | 'failed';

export interface QueuedOp {
  id: string;
  employeeId: number;
  kind: OpKind;
  /** What the employee reads in the "waiting to sync" lists ("Leave request · 28 Nov"). */
  label: string;
  method: OpMethod;
  /** Path under the API base, e.g. "/leave-requests". */
  url: string;
  /** JSON body (camelCase, the API client converts it), or the text fields of a multipart body when `files` is set. */
  body: Record<string, unknown> | null;
  files: OpFile[];
  /** React Query keys to refresh once the server has it. */
  invalidate: unknown[][];
  /** Anything the screens need to draw the queued item (destination, punch number, date ...). Never sent. */
  meta: Record<string, unknown>;
  /** Sent as the Idempotency-Key header: the same operation is done once however often it is sent. */
  idempotencyKey: string;
  createdAt: number;
  status: OpStatus;
  attempts: number;
  lastError: string | null;
  lastTriedAt: number | null;
  nextTryAt: number;
}

export type NewOp = Pick<QueuedOp, 'employeeId' | 'kind' | 'label' | 'method' | 'url'> &
  Partial<Pick<QueuedOp, 'body' | 'files' | 'invalidate' | 'meta' | 'idempotencyKey' | 'createdAt' | 'id'>>;

/** What the sync engine does with one answer (see classify.ts). */
export type SendVerdict =
  /** The server has it (2xx, or a replay of an earlier 2xx): delete it from the phone. */
  | { kind: 'done' }
  /** Nothing final happened (no internet, timeout, server busy/down): keep it and try again later. */
  | { kind: 'retry'; reason: string }
  /** The server refused it for good (validation, already decided ...): keep it, marked failed, with the server's words. */
  | { kind: 'failed'; message: string }
  /** The sign-in is no longer accepted: stop syncing (the API client signs out). */
  | { kind: 'auth' };

export interface QueueCounts {
  pending: number;
  failed: number;
}
