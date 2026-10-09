import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeClient } from './menu-test-utils';
import { SignInForm, signInErrorMessage } from './sign-in-form';

const OK = { error: null };

function setup(result: { error: unknown } = OK, variant?: 'staff' | 'portal') {
  const email = vi.fn().mockResolvedValue(result);
  render(
    <SignInForm
      authClient={fakeClient({ signIn: { email } })}
      variant={variant}
    />
  );
  return { email };
}

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('SignInForm', () => {
  it('shows the staff header and intro', () => {
    setup();
    expect(screen.getByText('Eduvault')).toBeInTheDocument();
    expect(screen.getByText('Staff sign-in')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Welcome back' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sign in with the email your school added.')
    ).toBeInTheDocument();
  });

  it('shows the portal header', () => {
    setup(OK, 'portal');
    expect(screen.getByText('Students and guardians')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sign in' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Staff sign-in')).not.toBeInTheDocument();
  });

  it('has no sign-up or forgot-password link, only the plain line', () => {
    setup();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /sign up/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Forgot your password? Ask your school owner to reset it.'
      )
    ).toBeInTheDocument();
  });

  it('asks for each empty field and does not call the server', () => {
    const { email } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(email).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email', async () => {
    const { email } = setup();
    fill(' ada@school.test ', 'long-enough-password');
    await waitFor(() => {
      expect(email).toHaveBeenCalledWith({
        email: 'ada@school.test',
        password: 'long-enough-password',
      });
    });
  });

  it.each([
    [{ status: 401 }, 'That email and password don’t match.'],
    [{ status: 404 }, 'That email and password don’t match.'],
    [{ status: 429 }, 'Too many attempts. Wait a minute and try again.'],
    [
      { status: 403, code: 'BANNED_USER' },
      'This account is switched off. Ask your school owner.',
    ],
  ])('answers %j with one message', async (error, message) => {
    setup({ error });
    fill('ada@school.test', 'long-enough-password');
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('maps failures to copy', () => {
    expect(signInErrorMessage({})).toBe('That email and password don’t match.');
  });
});
