package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wave-connect/sso-platform/apps/identity-service/internal/model"
)

var (
	ErrEnrollmentNotFound = errors.New("mfa enrollment not found")
	ErrBackupCodeNotFound = errors.New("backup code not found")
)

type MfaRepository struct {
	pool *pgxpool.Pool
}

func NewMfaRepository(pool *pgxpool.Pool) *MfaRepository {
	return &MfaRepository{pool: pool}
}

func (r *MfaRepository) CreateEnrollment(ctx context.Context, e *model.MfaEnrollment) error {
	const q = `INSERT INTO mfa_enrollments (id, user_id, method, status, secret_encrypted, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	_, err := r.pool.Exec(ctx, q,
		e.ID, e.UserID, e.Method, e.Status, e.SecretEncrypted, e.IsDefault, e.CreatedAt, e.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert mfa enrollment: %w", err)
	}
	return nil
}

func (r *MfaRepository) GetActiveEnrollments(ctx context.Context, userID uuid.UUID) ([]model.MfaEnrollment, error) {
	const q = `SELECT id, user_id, method, status, secret_encrypted, is_default, last_used_at, created_at, updated_at
		FROM mfa_enrollments WHERE user_id = $1 AND status = 'active'`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("query active enrollments: %w", err)
	}
	defer rows.Close()

	var enrollments []model.MfaEnrollment
	for rows.Next() {
		var e model.MfaEnrollment
		if err := rows.Scan(&e.ID, &e.UserID, &e.Method, &e.Status, &e.SecretEncrypted, &e.IsDefault, &e.LastUsedAt, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan enrollment: %w", err)
		}
		enrollments = append(enrollments, e)
	}
	return enrollments, rows.Err()
}

func (r *MfaRepository) GetEnrollmentByID(ctx context.Context, id uuid.UUID) (*model.MfaEnrollment, error) {
	const q = `SELECT id, user_id, method, status, secret_encrypted, is_default, last_used_at, created_at, updated_at
		FROM mfa_enrollments WHERE id = $1`
	e := &model.MfaEnrollment{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&e.ID, &e.UserID, &e.Method, &e.Status, &e.SecretEncrypted, &e.IsDefault, &e.LastUsedAt, &e.CreatedAt, &e.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrEnrollmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get enrollment by id: %w", err)
	}
	return e, nil
}

func (r *MfaRepository) ActivateEnrollment(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE mfa_enrollments SET status = 'active', updated_at = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("activate enrollment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrEnrollmentNotFound
	}
	return nil
}

func (r *MfaRepository) DeleteEnrollment(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	const q = `DELETE FROM mfa_enrollments WHERE id = $1 AND user_id = $2`
	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return fmt.Errorf("delete enrollment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrEnrollmentNotFound
	}
	return nil
}

func (r *MfaRepository) HasActiveEnrollment(ctx context.Context, userID uuid.UUID) (bool, error) {
	const q = `SELECT EXISTS(SELECT 1 FROM mfa_enrollments WHERE user_id = $1 AND status = 'active')`
	var exists bool
	err := r.pool.QueryRow(ctx, q, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check active enrollment: %w", err)
	}
	return exists, nil
}

func (r *MfaRepository) CreateBackupCodes(ctx context.Context, userID uuid.UUID, codeHashes []string) error {
	const q = `INSERT INTO mfa_backup_codes (user_id, code_hash, created_at) VALUES ($1, $2, $3)`
	now := time.Now().UTC()

	batch := &pgx.Batch{}
	for _, hash := range codeHashes {
		batch.Queue(q, userID, hash, now)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range codeHashes {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("insert backup code: %w", err)
		}
	}
	return nil
}

func (r *MfaRepository) UseBackupCode(ctx context.Context, userID uuid.UUID, codeHash string) (bool, error) {
	const q = `UPDATE mfa_backup_codes SET used_at = $3
		WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`
	tag, err := r.pool.Exec(ctx, q, userID, codeHash, time.Now().UTC())
	if err != nil {
		return false, fmt.Errorf("use backup code: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

func (r *MfaRepository) GetUnusedBackupCodeCount(ctx context.Context, userID uuid.UUID) (int, error) {
	const q = `SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL`
	var count int
	err := r.pool.QueryRow(ctx, q, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count unused backup codes: %w", err)
	}
	return count, nil
}

func (r *MfaRepository) GetUnusedBackupCodes(ctx context.Context, userID uuid.UUID) ([]model.MfaBackupCode, error) {
	const q = `SELECT id, user_id, code_hash, created_at FROM mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("query unused backup codes: %w", err)
	}
	defer rows.Close()

	var codes []model.MfaBackupCode
	for rows.Next() {
		var c model.MfaBackupCode
		if err := rows.Scan(&c.ID, &c.UserID, &c.CodeHash, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan backup code: %w", err)
		}
		codes = append(codes, c)
	}
	return codes, rows.Err()
}

func (r *MfaRepository) MarkBackupCodeUsed(ctx context.Context, id int64) error {
	const q = `UPDATE mfa_backup_codes SET used_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("mark backup code used: %w", err)
	}
	return nil
}

func (r *MfaRepository) DeleteAllBackupCodes(ctx context.Context, userID uuid.UUID) error {
	const q = `DELETE FROM mfa_backup_codes WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, q, userID)
	if err != nil {
		return fmt.Errorf("delete all backup codes: %w", err)
	}
	return nil
}

// CreateWebAuthnEnrollment creates an MFA enrollment with WebAuthn credential data.
func (r *MfaRepository) CreateWebAuthnEnrollment(ctx context.Context, e *model.MfaEnrollment) error {
	const q = `INSERT INTO mfa_enrollments
		(id, user_id, method, status, credential_id, public_key, sign_count, transports, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := r.pool.Exec(ctx, q,
		e.ID, e.UserID, e.Method, e.Status, e.CredentialID, e.PublicKey, e.SignCount, e.Transports,
		e.IsDefault, e.CreatedAt, e.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert webauthn enrollment: %w", err)
	}
	return nil
}

// GetWebAuthnEnrollments returns all active WebAuthn enrollments for a user.
func (r *MfaRepository) GetWebAuthnEnrollments(ctx context.Context, userID uuid.UUID) ([]model.MfaEnrollment, error) {
	const q = `SELECT id, user_id, method, status, credential_id, public_key, sign_count, transports,
		is_default, last_used_at, created_at, updated_at
		FROM mfa_enrollments WHERE user_id = $1 AND method = 'webauthn' AND status = 'active'`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("query webauthn enrollments: %w", err)
	}
	defer rows.Close()

	var enrollments []model.MfaEnrollment
	for rows.Next() {
		var e model.MfaEnrollment
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.Method, &e.Status, &e.CredentialID, &e.PublicKey, &e.SignCount, &e.Transports,
			&e.IsDefault, &e.LastUsedAt, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan webauthn enrollment: %w", err)
		}
		enrollments = append(enrollments, e)
	}
	return enrollments, rows.Err()
}

// UpdateSignCount updates the sign counter for a WebAuthn credential after successful authentication.
func (r *MfaRepository) UpdateSignCount(ctx context.Context, id uuid.UUID, signCount int64) error {
	const q = `UPDATE mfa_enrollments SET sign_count = $2, last_used_at = $3, updated_at = $3 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, signCount, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("update sign count: %w", err)
	}
	return nil
}

func (r *MfaRepository) UpdateLastUsed(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE mfa_enrollments SET last_used_at = $2, updated_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("update last used: %w", err)
	}
	return nil
}
