import peg from '../pPEG.mjs'

console.log("Arith operatpr expression example....")

const arith = peg.compile(`
  exp = add 
  add = sub ('+' sub)*
  sub = mul ('-' mul)*
  mul = div ('*' div)*
  div = pow ('/' pow)*
  pow = val ('^' val)*
  grp = '(' exp ')'
  val = " " (sym / num / grp) " "
  sym = [a-zA-Z]+
  num = [0-9]+
`);

const tests = [
    ` 1 + 2 * 3 `,
    `x^2^3 - 1`
];

for (let test of tests) {
    const p = arith.parse(test);
    if (p.ok) console.log(JSON.stringify(p.ptree));
    else console.log(p.err);
}

// 1+2*3 ==> (+ 1 (* 2 3))
// ["add",[["num","1"],["mul",[["num","2"],["num","3"]]]]]

// x^2^3+1 ==> (+ (^ x 2 3) 1)
// ["add",[["pow",[["sym","x"],["num","2"],["num","3"]]],["num","1"]]]
