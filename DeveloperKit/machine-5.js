/*
    Step 5: 
    full pPEG grammar, 
    7-instruction parser machine,
    parser_code from pPEG ptree,
    export grammar compile API
*/

const pPEG_grammar = `
    Peg   = _ rule+
    rule  = id _ '=' _ alt

    alt   = seq ('/' _ seq)*
    seq   = rep+
    rep   = pre sfx? _
    pre   = pfx? term
    term  = call / sq / chs / group / extn

    id    = [a-zA-Z_] [a-zA-Z0-9_]*
    pfx   = [&!~]
    sfx   = [+?] / '*' range?
    range = num (dots num?)?
    num   = [0-9]+
    dots  = '..'

    call  = id _ !'='
    sq    = ['] ~[']* [']
    chs   = '[' ~']'* ']'
    group = '(' _ alt ')'
    extn  = '<' ~'>'* '>'
    _     = ('#' ~[\n\r]* / [ \t\n\r]*)*
`;

const boot_ptree = ["Peg",[  // copied from machine-4.js output...
    ["rule",[["id","Peg"],
        ["seq",[["id","_"],["rep",[["id","rule"],["sfx","+"]]]]]]],
    ["rule",[["id","rule"],
        ["seq",[["id","id"],["id","_"],["sq","'='"],["id","_"],["id","alt"]]]]],
    ["rule",[["id","alt"],
        ["seq",[["id","seq"],["rep",[["seq",[["sq","'/'"],["id","_"],["id","seq"]]],["sfx","*"]]]]]]],
    ["rule",[["id","seq"],
        ["seq",[["rep",[["id","rep"],["sfx","+"]]],["id","_"]]]]],
    ["rule",[["id","rep"],
        ["seq",[["id","pre"],["rep",[["id","sfx"],["sfx","?"]]],["rep",[["sq","' '"],["sfx","*"]]]]]]],
    ["rule",[["id","pre"],
        ["seq",[["rep",[["id","pfx"],["sfx","?"]]],["id","term"]]]]],
    ["rule",[["id","term"],
        ["alt",[["id","id"],["id","sq"],["id","chs"],["id","group"]]]]],
    ["rule",[["id","id"],
        ["rep",[["chs","[a-zA-Z_]"],["sfx","+"]]]]],
    ["rule",[["id","pfx"],["chs","[&!~]"]]],
    ["rule",[["id","sfx"],["chs","[+?*]"]]],
    ["rule",[["id","sq"],
        ["seq",[["chs","[']"],["rep",[["pre",[["pfx","~"],["chs","[']"]]],["sfx","*"]]],["chs","[']"]]]]],
    ["rule",[["id","chs"],
        ["seq",[["sq","'['"],["rep",[["pre",[["pfx","~"],["sq","']'"]]],["sfx","*"]]],["sq","']'"]]]]],
    ["rule",[["id","group"],
        ["seq",[["sq","'('"],["id","_"],["id","alt"],["sq","')'"]]]]],
    ["rule",[["id","_"],
        ["rep",[["chs","[ \t\n\r]"],["sfx","*"]]]]]]];

const boot_code = parser_code(boot_ptree);
// console.log("boot_code=\n",JSON.stringify(boot_code));

function parser_code(ptree) { // for simple interpreter code
    let code = {};
    for (rule of ptree[1]) {
        const [_rule, [[_id, name], exp]] = rule;
        code[name] = exp;
    }
    const [_rule, [[_id, start], _exp]] = ptree[1][0];
    code["$start"] = ["id", start];
    return code;
}

function parse(grammar_code, input) {
    let env = {
        code: grammar_code,
        input: input,
        pos: 0,    // cursor position
        tree: []   // for building the parse tree
    }
    const result = eval(env.code["$start"], env);
    if (!result) return null;
    return env.tree[0]; // ptree result
}

var TRACE = false;

function eval(exp, env) {
    if (TRACE) console.log("pos=", env.pos, exp);
    switch (exp[0]) {

    case "id": { // (id name)
        const name = exp[1],
            expr = env.code[name],
            start = env.pos,
            stack = env.tree.length;
        if (!expr) throw "undefined rule: "+name;
        const result = eval(expr, env);
        if (!result) return false;
        if (env.tree.length === stack) { // terminal string value..
            if (name[0] === '_') return true;
            env.tree.push([name, env.input.slice(start, env.pos)]);
            return true; // => (name, "matched..")
        }
        if (env.tree.length - stack > 1) { // nested rule results..
            const tree = [name, env.tree.slice(stack)]; // stack...top
            env.tree = env.tree.slice(0, stack);
            env.tree.push(tree);
            return true; // => (name (...rule_results))
        }
        return true; //  elide this rule label => ()
    }

    case "seq": { // (seq (args...))
        for (const arg of exp[1]) {
            const result = eval(arg, env);
            if (!result) return false;
        }
        return true;
    }

    case "alt": { // (alt (args...))
        const start = env.pos,
            stack = env.tree.length;
        for (const arg of exp[1]) {
            const result = eval(arg, env);
            if (result) return true;
            if (env.tree.length > stack) {
                env.tree = env.tree.slice(0, stack);
            }
            env.pos = start; // try the next one
        }
        return false;
    }

    case "sq": { // (sq "'txt..'")
        const input = env.input, txt = exp[1];
        let pos = env.pos;
        for (let i=1; i < txt.length-1; i+=1) {
            if (txt[i] !== input[pos]) return false;
            pos += 1;
        }
        env.pos = pos;
        return true;
    }

    case "chs": { // (chs, "[str..]"]
        const str = exp[1];
        let pos = env.pos;
        for (let i = 1; i < str.length-1; i += 1) {
            const ch = env.input[pos];
            if (!ch) return false;
            if (i+2 < str.length-1 && str[i+1] == '-') {
                if (ch < str[i] || ch > str[i+2]) {
                    i += 2;
                    continue;
                }
            } else {
                if (ch !== str[i]) continue;
            }
            env.pos += 1;
            return true;
        }
        return false;
    }

    case "rep": {
        const [_rep, [expr, [_sfx, sfx]]] = exp,
            start = env.pos,
            stack = env.tree.length;
        let min = 0, max = 0; // sfx === "*"
        if (sfx === "+") min = 1;
        else if (sfx === "?") max = 1;
        let count = 0, pos = env.pos;
        while (true) { // min..max        
            const result = eval(expr, env);
            if (result === false) break;
            if (pos === env.pos) break; // no progress
            count += 1;
            if (count === max) break; // max 0 means any`
            pos = env.pos;
        }
        if (count < min) {
            if (env.tree.length > stack) {
                env.tree = env.tree.slice(0, stack);
            }
            return false;
        }
        return true;
    }

    case "pre": { // [pre, [sign, expr]]
        const [_pre, [[_pfx, sign], term]] = exp,
            start = env.pos,
            stack = env.tree.length,
            result = eval(term, env);
        env.pos = start; // reset
        if (env.tree.length > stack) {
            env.tree = env.tree.slice(0, stack);
        }
        if (sign === "~") {
            if (result === false && env.pos < env.input.length) {
                env.pos += 1; // match a character
                return true;
            }
            return false;
        }
        if (sign === "!") return !result;
        return result; // &
    }

    default: 
        throw "undefined instruction: "+exp[0];

    } // switch
}

// compile pPEG with boot_code...

const date_grammar = `
    date  = year '-' month '-' day 
    year  = [0-9]+ 
    month = [0-9]+ 
    day   = [0-9]+ 
`;

const date_ptree_boot = parse(boot_code, date_grammar);
// console.log("date_ptree_boot=",date_ptree_boot);

const pPEG_ptree_boot = parse(boot_code, pPEG_grammar);
// console.log("pPEG_ptree_boot=",pPEG_ptree_boot);

const pPEG_code = parser_code(pPEG_ptree_boot);
// console.log( JSON.stringify(pPEG_code) );

// compile pPEG with pPEG and check it is the same....

const pPEG_ptree = parse(pPEG_code, pPEG_grammar);

const pPEG_code_chk = parser_code(pPEG_ptree);

console.log("pPJEG_code_chk=\n", JSON.stringify(pPEG_code_chk) );

// -- API ------------------------------------------------------------

exports.compile = function compile(grammar) {
    const pegtree = parse(pPEG_code, grammar);
    // console.log(JSON.stringify(pegtree));
    const code = parser_code(pegtree);
    console.log(JSON.stringify(code));
    const parser = function parser(input) {
        return parse(code, input);
    }
    return {
        parse: parser,
    };
}
