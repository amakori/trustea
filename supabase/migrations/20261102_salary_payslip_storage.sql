INSERT INTO storage.buckets (id, name, public)
VALUES ('salary-payslips', 'salary-payslips', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users upload their own payslips" ON storage.objects;
CREATE POLICY "Users upload their own payslips"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'salary-payslips'
        AND (storage.foldername(name))[1] = 'payslips'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

DROP POLICY IF EXISTS "MFI operators read payslips" ON storage.objects;
CREATE POLICY "MFI operators read payslips"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'salary-payslips'
        AND COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'mfi_operator',
            false
        )
    );

DROP POLICY IF EXISTS "Users read own payslips" ON storage.objects;
CREATE POLICY "Users read own payslips"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'salary-payslips'
        AND (storage.foldername(name))[1] = 'payslips'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );
