// As defined in https://github.com/mozilla/pdf.js/blob/d9fac3459609a807be6506fb3441b5da4b154d14/src/shared/util.js#L371-L374

const PasswordResponses = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2,
} as const;

export default PasswordResponses;
