import * as fc from 'fast-check';
import * as jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';

/**
 * Property 5: Round-trip JWT emisión y verificación
 *
 * For any usuario válido con claims (usuario_id, empresa_id, rnc, rol),
 * emitir un Access_Token JWT firmado con RS256 y luego verificar ese token
 * con la clave pública correspondiente debe extraer exactamente los mismos
 * claims originales. Cualquier alteración de un solo bit en el token debe
 * resultar en fallo de verificación.
 *
 * **Validates: Requirements 2.1, 2.5, 2.12**
 */
describe('Property 5: Round-trip JWT emisión y verificación', () => {
  // Generate a fresh RSA key pair for all tests in this suite
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Arbitraries for valid claims
  const uuidArb = fc.uuid();

  const rncArb = fc.oneof(
    // 9-digit RNC
    fc.string({
      minLength: 9,
      maxLength: 9,
      unit: fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
    }),
    // 11-digit RNC (cédula)
    fc.string({
      minLength: 11,
      maxLength: 11,
      unit: fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
    }),
  );

  const rolArb = fc.constantFrom('admin', 'facturador', 'lector');

  const claimsArb = fc.record({
    usuario_id: uuidArb,
    empresa_id: uuidArb,
    rnc: rncArb,
    rol: rolArb,
  });

  it('should round-trip: sign then verify returns exact same claims', () => {
    fc.assert(
      fc.property(claimsArb, (claims) => {
        // Sign the token with private key (RS256)
        const token = jwt.sign(
          {
            usuario_id: claims.usuario_id,
            empresa_id: claims.empresa_id,
            rnc: claims.rnc,
            rol: claims.rol,
          },
          privateKey,
          { algorithm: 'RS256', expiresIn: 900 },
        );

        // Verify the token with public key
        const decoded = jwt.verify(token, publicKey, {
          algorithms: ['RS256'],
        }) as jwt.JwtPayload;

        // Claims must be preserved exactly
        expect(decoded.usuario_id).toBe(claims.usuario_id);
        expect(decoded.empresa_id).toBe(claims.empresa_id);
        expect(decoded.rnc).toBe(claims.rnc);
        expect(decoded.rol).toBe(claims.rol);
      }),
      { numRuns: 100 },
    );
  });

  it('should fail verification when any character in the token is altered', () => {
    fc.assert(
      fc.property(claimsArb, fc.nat(), (claims, tamperSeed) => {
        // Sign the token
        const token = jwt.sign(
          {
            usuario_id: claims.usuario_id,
            empresa_id: claims.empresa_id,
            rnc: claims.rnc,
            rol: claims.rol,
          },
          privateKey,
          { algorithm: 'RS256', expiresIn: 900 },
        );

        // Pick a position to tamper (avoid the dots that separate header.payload.signature)
        const chars = token.split('');
        const nonDotIndices = chars.map((c, i) => (c !== '.' ? i : -1)).filter((i) => i >= 0);

        const tamperIndex = nonDotIndices[tamperSeed % nonDotIndices.length];

        // Alter the character at tamperIndex ensuring it's actually different
        const originalChar = chars[tamperIndex];
        const base64urlChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const currentIdx = base64urlChars.indexOf(originalChar);
        // If the character is not in base64url (e.g., '='), use index 0 as base
        const baseIdx = currentIdx >= 0 ? currentIdx : 0;
        const newChar = base64urlChars[(baseIdx + 1) % base64urlChars.length];
        // Ensure character is actually different
        if (newChar === originalChar) {
          chars[tamperIndex] = base64urlChars[(baseIdx + 2) % base64urlChars.length];
        } else {
          chars[tamperIndex] = newChar;
        }

        const tamperedToken = chars.join('');

        // Ensure we actually tampered the token
        if (tamperedToken === token) {
          return; // Skip if somehow no change was made (shouldn't happen)
        }

        // Verification must fail
        expect(() => {
          jwt.verify(tamperedToken, publicKey, { algorithms: ['RS256'] });
        }).toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
