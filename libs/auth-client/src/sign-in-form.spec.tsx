import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeClient } from './menu-test-utils';
import { SignInForm, signInErrorMessage } from './sign-in-form';

const OK = { error: null };

function setup(result: { error: unknown } = OK, variant?: 'staff' | 'portal') {
  const email = vi.fn().mockResolvedValue(result);
  const username = vi.fn().mockResolvedValue(result);
  render(
    <SignInForm
      authClient={fakeClient({ signIn: { email, username } })}
      variant={variant}
    />
  );
  return { email, username };
}

const fill = (email: string, password: string, label = 'Email') => {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('SignInForm', () => {
  it('greets staff with Welcome back', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Welcome back' })
    ).toBeInTheDocument();
  });

  it('titles the portal form Sign in', () => {
    setup(OK, 'portal');
    expect(
      screen.getByRole('heading', { name: 'Sign in' })
    ).toBeInTheDocument();
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

  it('keeps the staff form email-only', async () => {
    const { email, username } = setup();
    fill('ada', 'long-enough-password');
    await waitFor(() => {
      expect(email).toHaveBeenCalledWith({
        email: 'ada',
        password: 'long-enough-password',
      });
    });
    expect(username).not.toHaveBeenCalled();
  });
});

describe('SignInForm in the portal', () => {
  const LABEL = 'Username or email';

  it('asks for a username or email', () => {
    setup(OK, 'portal');
    expect(screen.getByLabelText(LABEL)).toHaveAttribute('type', 'text');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('signs in by username when the input has no @', async () => {
    const { email, username } = setup(OK, 'portal');
    fill(' greenfield-0123 ', 'long-enough-password', LABEL);
    await waitFor(() => {
      expect(username).toHaveBeenCalledWith({
        username: 'greenfield-0123',
        password: 'long-enough-password',
      });
    });
    expect(email).not.toHaveBeenCalled();
  });

  it('signs in by email when the input has an @', async () => {
    const { email, username } = setup(OK, 'portal');
    fill('ngozi@example.com', 'long-enough-password', LABEL);
    await waitFor(() => {
      expect(email).toHaveBeenCalledWith({
        email: 'ngozi@example.com',
        password: 'long-enough-password',
      });
    });
    expect(username).not.toHaveBeenCalled();
  });

  it('asks for the missing identifier in its own words', () => {
    const { email, username } = setup(OK, 'portal');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your username or email.')).toBeVisible();
    expect(email).not.toHaveBeenCalled();
    expect(username).not.toHaveBeenCalled();
  });

  it('says a failed username sign-in does not match', async () => {
    setup({ error: { status: 401 } }, 'portal');
    fill('greenfield-0123', 'wrong-password-123', LABEL);
    expect(
      await screen.findByText(
        'That username or email and password don’t match.'
      )
    ).toBeInTheDocument();
  });

  it('keeps the shared messages for a rate limit', () => {
    expect(signInErrorMessage({ status: 429 }, 'portal')).toBe(
      'Too many attempts. Wait a minute and try again.'
    );
    expect(signInErrorMessage({}, 'portal')).toBe(
      'That username or email and password don’t match.'
    );
  });
});
