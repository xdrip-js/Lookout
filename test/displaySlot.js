/* global describe it */

const should = require('should');

const { resolveDisplayType, slotFailureHint } = require('../displaySlot');

// G7 display slots: 1 medical (receiver or pump, e.g. Omnipod 5), 2 phone app,
// 3 watch. Claiming the medical slot can disconnect a pump's CGM link.
describe('displaySlot.resolveDisplayType', () => {
  it('defaults a G7 to the watch slot', () => {
    resolveDisplayType({ txId: '1234' }).should.equal(3);
  });

  it('accepts names and numbers', () => {
    resolveDisplayType({ txId: '1234', displayType: 'phone' }).should.equal(2);
    resolveDisplayType({ txId: '1234', displayType: 'watch' }).should.equal(3);
    resolveDisplayType({ txId: '1234', displayType: '2' }).should.equal(2);
    resolveDisplayType({ txId: '1234', displayType: 3 }).should.equal(3);
  });

  it('refuses the medical slot for a G7 unless forced', () => {
    (() => resolveDisplayType({ txId: '1234', displayType: 'medical' }))
      .should.throw(/medical slot/);
    resolveDisplayType({ txId: '1234', displayType: 'medical', forceMedical: true })
      .should.equal(1);
  });

  it('treats --alternate on a G7 as the medical slot, so refuses it unless forced', () => {
    (() => resolveDisplayType({ txId: '1234', alternate: true })).should.throw(/medical slot/);
    resolveDisplayType({ txId: '1234', alternate: true, forceMedical: true }).should.equal(1);
  });

  it('rejects unknown display types', () => {
    (() => resolveDisplayType({ txId: '1234', displayType: 'tablet' })).should.throw(/display type/);
    (() => resolveDisplayType({ txId: '1234', displayType: 4 })).should.throw(/display type/);
  });

  it('does not apply to G5/G6', () => {
    should(resolveDisplayType({ txId: '8G1234', displayType: 'watch' })).equal(null);
    should(resolveDisplayType({ txId: '8G1234', alternate: true })).equal(null);
  });
});

// The xDrip+ display certificate xdrip-js presents may be tied to the phone
// display type on a real sensor; if the watch slot keeps failing, say so.
describe('displaySlot.slotFailureHint', () => {
  it('suggests the phone slot after repeated failures on the watch slot', () => {
    slotFailureHint({ txId: '1234', displayType: 3, failedReads: 3 })
      .should.match(/watch slot.*certificate.*--display_type phone/);
  });

  it('stays quiet for occasional failures', () => {
    should(slotFailureHint({ txId: '1234', displayType: 3, failedReads: 2 })).equal(null);
  });

  it('stays quiet on other slots and for G6', () => {
    should(slotFailureHint({ txId: '1234', displayType: 2, failedReads: 5 })).equal(null);
    should(slotFailureHint({ txId: '8G1234', displayType: null, failedReads: 5 })).equal(null);
  });
});

describe('displaySlot with no transmitter id yet', () => {
  it('neither throws nor picks a slot', () => {
    should(resolveDisplayType({ txId: undefined })).equal(null);
    should(slotFailureHint({ txId: undefined, displayType: 3, failedReads: 5 })).equal(null);
  });
});
