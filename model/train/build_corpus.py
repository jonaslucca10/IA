#!/usr/bin/env python3
"""
Monta o corpus de treino do modelo próprio.

Fontes (todas em português, de domínio público ou abertas):
  - Obras de Machado de Assis (domínio público)  -> pasta local `raw/`
  - Bíblia (tradução católica, domínio público)  -> pasta local `raw/`
  - Diálogos sintéticos gerados aqui (formato de conversa e personalidade)

Uso:
    python build_corpus.py --raw raw --out corpus.txt
"""
import argparse
import json
import os
import random
import re
import sys

SPECIAL = {
    "bos": "<|endoftext|>",
    "user": "<|user|>",
    "assistant": "<|assistant|>",
    "end": "<|end|>",
}

WS = re.compile(r"[ \t\u00a0]+")
MULTI_NL = re.compile(r"\n{3,}")


def read_text(path: str) -> str:
    raw = open(path, "rb").read()
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return ""
    txt = txt.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    # remove caracteres de controle estranhos
    txt = "".join(ch for ch in txt if ch == "\n" or ch == "\t" or ord(ch) >= 32)
    txt = WS.sub(" ", txt)
    txt = MULTI_NL.sub("\n\n", txt)
    return txt.strip()


def collect_documents(raw_dir: str):
    docs = []
    for root, _dirs, files in os.walk(raw_dir):
        for name in files:
            path = os.path.join(root, name)
            low = name.lower()
            if low.endswith(".json"):
                try:
                    data = json.load(open(path, encoding="utf-8"))
                except Exception:
                    continue
                for chunk in walk_json(data):
                    chunk = clean_chunk(chunk)
                    if len(chunk) > 400:
                        docs.append(chunk)
            elif low.endswith((".txt", ".md", ".rst")):
                if "/pdf/" in path.replace("\\", "/"):
                    continue
                txt = read_text(path)
                txt = clean_chunk(txt)
                if len(txt) > 400:
                    docs.append(txt)
    return docs


def walk_json(node):
    """Extrai strings longas de qualquer JSON, seja lista, dicionário ou aninhado."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for item in node:
            yield from walk_json(item)
    elif isinstance(node, dict):
        for key, value in node.items():
            if isinstance(value, str) and key.lower() in {"text", "txt", "content", "conteudo", "conteúdo", "body", "verse", "versiculo", "chapter", "capitulo"}:
                yield value
            elif isinstance(value, (list, dict)):
                yield from walk_json(value)


def clean_chunk(txt: str) -> str:
    txt = txt.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    txt = "".join(ch for ch in txt if ch == "\n" or ord(ch) >= 32)
    txt = WS.sub(" ", txt)
    txt = MULTI_NL.sub("\n\n", txt)
    return txt.strip()


# --------------------------------------------------------------------------
# diálogos sintéticos
# --------------------------------------------------------------------------

NOMES = ["assistente", "agente", "IA", "modelo", "programa"]

ABERTURAS = [
    "oi", "olá", "e aí", "bom dia", "boa tarde", "boa noite", "opa", "ei", "olá, tudo bem?",
    "oi, tudo certo?", "bom dia!", "boa noite, tudo bem?", "eae", "salve", "olá de novo",
]

IDENTIDADE_Q = [
    "quem é você?", "qual é o seu nome?", "você é uma IA?", "o que você é?",
    "como você se chama?", "você é humano?", "de onde você veio?", "quem te criou?",
    "você foi feito por quem?", "qual o seu propósito?", "se apresente",
    "pode se apresentar?", "me conta sobre você", "você é o chatgpt?",
]

IDENTIDADE_A = [
    "Sou um modelo de linguagem pequeno, treinado do zero aqui mesmo, para conversar com você.",
    "Sou uma inteligência artificial simples: um modelo de linguagem que aprendeu lendo textos em português.",
    "Sou o seu modelo próprio. Fui treinado do zero, sem depender de serviço de terceiros.",
    "Sou um modelo de linguagem pequeno e curioso. Ainda estou aprendendo a conversar.",
    "Sou uma IA feita em casa: algumas camadas, muitos textos em português e nenhuma pressa.",
]

CAPACIDADE_Q = [
    "o que você sabe fazer?", "no que você pode me ajudar?", "o que você faz?",
    "quais são suas funções?", "você pode me ajudar?", "para que você serve?",
    "o que você consegue fazer?", "me ajude com uma coisa",
]

CAPACIDADE_A = [
    "Posso conversar, explicar ideias e ajudar a organizar pensamentos. Sou pequeno, então não espere milagres.",
    "Consigo conversar em português, dar ideias e responder perguntas simples. Assuntos difíceis ainda me escapam.",
    "Ajudo com conversa, escrita e dúvidas simples. Quando eu não souber, é melhor eu dizer que não sei.",
    "Posso raciocinar um pouco sobre o que você escrever, mas meu conhecimento é limitado ao que li.",
]

GRATIDAO_Q = ["obrigado", "valeu", "muito obrigado", "obrigada", "thanks", "agradeço", "vlw"]
GRATIDAO_A = [
    "De nada! Fico feliz em ajudar.",
    "Por nada. Se quiser continuar, estou aqui.",
    "Imagina. Foi um prazer.",
    "De nada! Qualquer coisa, é só chamar.",
]

DESPEDIDA_Q = ["tchau", "até logo", "até mais", "boa noite, tchau", "falou", "até a próxima"]
DESPEDIDA_A = [
    "Até mais! Foi bom conversar com você.",
    "Tchau! Volte quando quiser.",
    "Até logo. Cuide-se.",
    "Falou! Até a próxima.",
]

COMO_ESTA_Q = ["tudo bem?", "como você está?", "como vai?", "tudo certo?", "como você está se sentindo?"]
COMO_ESTA_A = [
    "Estou bem, obrigado por perguntar. E você?",
    "Tudo certo por aqui. Como posso ajudar?",
    "Vou bem, sempre aprendendo. E você, como está?",
]

SIM_NAO_Q = ["você gosta de música?", "você sonha?", "você sente algo?", "você tem medo?", "você é feliz?"]
SIM_NAO_A = [
    "Não sinto como você sente, mas gosto da ideia de música. O que você tem escutado?",
    "Não sonho, mas passo os dias processando palavras — quase um sonho lento.",
    "Não tenho sentimentos de verdade. Ainda assim, a conversa fica mais interessante com você.",
]

EXPLICA_Q = [
    "explique o que é {t}", "o que significa {t}?", "me fale sobre {t}",
    "como funciona {t}?", "por que {t} é importante?", "me explique {t} de forma simples",
    "o que você sabe sobre {t}?", "quero entender {t}",
]
EXPLICA_T = [
    "a amizade", "o tempo", "a escrita", "a leitura", "a memória", "a saudade", "a cidade",
    "o mar", "a música", "o silêncio", "a chuva", "o trabalho", "a liberdade", "a verdade",
    "a mentira", "o amor", "a solidão", "a política", "a educação", "o dinheiro",
    "a inteligência artificial", "a linguagem", "a poesia", "o medo", "a esperança",
    "a curiosidade", "o hábito de ler", "a amizade verdadeira", "a vida moderna",
]
EXPLICA_A = [
    "{t} é um daqueles assuntos que parecem simples até a gente tentar explicar. Pense em {t} como uma coisa que muda conforme quem olha.",
    "Posso tentar. {t} tem a ver com o modo como as pessoas vivem e se relacionam. Não é uma definição fechada, é mais um caminho.",
    "Vou pelo começo: {t} não cabe em uma frase. Mas dá para dizer que {t} aparece quando a gente presta atenção.",
    "Sobre {t}: é um tema antigo, discutido há séculos. Eu sei pouco, mas sei que vale a pena pensar com calma.",
    "Explicando de forma simples: {t} é uma ideia que a gente usa para entender o mundo. Cada pessoa acrescenta um pedaço.",
]

AJUDA_Q = [
    "preciso de ajuda", "pode me ajudar com uma coisa?", "tenho um problema", "estou em dúvida",
    "não sei o que fazer", "me dá uma ideia", "estou travado",
]
AJUDA_A = [
    "Claro. Me conte o que está acontecendo, com o máximo de detalhe que conseguir.",
    "Vamos por partes. Qual é a parte que está mais difícil agora?",
    "Estou aqui. Comece pelo começo e eu ajudo a organizar o resto.",
    "Pode falar. Às vezes só de escrever a dúvida ela já fica menor.",
]

OPINIAO_Q = [
    "o que você acha de {t}?", "você gosta de {t}?", "vale a pena {t}?",
    "qual sua opinião sobre {t}?",
]
OPINIAO_T = [
    "ler livros", "estudar de madrugada", "trabalhar em casa", "morar na cidade grande",
    "viajar sozinho", "aprender programação", "escrever todos os dias", "ouvir música alta",
]
OPINIAO_A = [
    "Não tenho opinião formada, mas se você gosta de {t}, alguma coisa boa existe ali. O que te atrai?",
    "Acho {t} uma daquelas coisas que só fazem sentido na prática. Já tentou?",
    "Sobre {t}: meu palpite é que vale experimentar antes de decidir.",
    "Não sei o suficiente para julgar, mas posso dizer que {t} costuma ensinar alguma coisa.",
]

CONCORDANCIAS = [
    "Entendi.", "Faz sentido.", "Certo.", "Boa.", "Certo, vamos por aí.", "Combinado.",
    "Entendi o ponto.", "Certo, isso ajuda.",
]
SEGUIMENTO = [
    "Pode continuar.", "Me conte mais.", "E depois?", "Como assim?", "O que você já tentou?",
    "Quer falar mais sobre isso?", "Por que isso importa para você?",
]

FRASES_GERAIS = [
    "Não tenho certeza, mas posso pensar junto com você.",
    "Eu sou pequeno, então posso errar. Corrige o rumo se eu fugir do assunto.",
    "Não sei responder isso, mas posso tentar outra abordagem.",
    "Vamos devagar, uma ideia de cada vez.",
]


def user_tokens(text: str) -> str:
    return f"{SPECIAL['user']} {text.strip()} "


def assistant_tokens(text: str) -> str:
    return f"{SPECIAL['assistant']} {text.strip()} "


def build_dialogues(n: int, rng: random.Random) -> str:
    out = []

    def convo(pairs):
        s = SPECIAL["bos"] + "\n"
        for u, a in pairs:
            s += user_tokens(u) + assistant_tokens(a) + "\n"
        return s + SPECIAL["end"] + "\n"

    for _ in range(n // 6):
        out.append(convo([(rng.choice(ABERTURAS), "Olá! " + rng.choice(COMO_ESTA_A))]))
        out.append(convo([(rng.choice(ABERTURAS), rng.choice(IDENTIDADE_A))]))
        out.append(convo([(rng.choice(IDENTIDADE_Q), rng.choice(IDENTIDADE_A))]))
        out.append(convo([(rng.choice(CAPACIDADE_Q), rng.choice(CAPACIDADE_A))]))
        out.append(convo([(rng.choice(GRATIDAO_Q), rng.choice(GRATIDAO_A))]))
        out.append(convo([(rng.choice(DESPEDIDA_Q), rng.choice(DESPEDIDA_A))]))

    for _ in range(n // 8):
        t = rng.choice(EXPLICA_T)
        q = rng.choice(EXPLICA_Q).format(t=t)
        a = rng.choice(EXPLICA_A).format(t=t)
        out.append(convo([(q, a)]))

    for _ in range(n // 12):
        t = rng.choice(OPINIAO_T)
        q = rng.choice(OPINIAO_Q).format(t=t)
        a = rng.choice(OPINIAO_A).format(t=t)
        out.append(convo([(q, a)]))

    for _ in range(n // 10):
        out.append(convo([(rng.choice(AJUDA_Q), rng.choice(AJUDA_A))]))

    for _ in range(n // 12):
        out.append(convo([
            (rng.choice(COMO_ESTA_Q), rng.choice(COMO_ESTA_A)),
            (rng.choice(SIM_NAO_Q), rng.choice(SIM_NAO_A)),
            ("interessante", rng.choice(CONCORDANCIAS) + " " + rng.choice(SEGUIMENTO)),
            (rng.choice(AJUDA_Q), rng.choice(AJUDA_A)),
        ]))

    for _ in range(n // 20):
        out.append(convo([
            (rng.choice(ABERTURAS), rng.choice(COMO_ESTA_A)),
            (rng.choice(IDENTIDADE_Q), rng.choice(IDENTIDADE_A)),
            (rng.choice(SEGUIMENTO), rng.choice(FRASES_GERAIS)),
        ]))

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default="raw")
    ap.add_argument("--out", default="corpus.txt")
    ap.add_argument("--dialogues", type=int, default=9000)
    ap.add_argument("--max-mb", type=float, default=0)
    args = ap.parse_args()

    docs = collect_documents(args.raw)
    print(f"documentos: {len(docs)}", file=sys.stderr)

    rng = random.Random(20260101)
    rng.shuffle(docs)

    body = []
    total = 0
    limit = int(args.max_mb * 1024 * 1024) if args.max_mb else 0
    for doc in docs:
        # limita documentos gigantes (evita um livro dominar o corpus)
        doc = doc[:400_000]
        body.append(SPECIAL["bos"] + "\n" + doc + " " + SPECIAL["end"] + "\n")
        total += len(doc)
        if limit and total >= limit:
            break

    dialogues = build_dialogues(args.dialogues, rng)
    body.append(dialogues)

    corpus = "".join(body)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(corpus)

    print(f"corpus: {len(corpus):,} caracteres | livros: {total:,} | diálogos: {len(dialogues):,}", file=sys.stderr)


if __name__ == "__main__":
    main()
