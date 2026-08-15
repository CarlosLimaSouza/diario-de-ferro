// Base de alimentos de referência (valores por 100g), compilada a partir de
// valores nutricionais amplamente documentados pra alimentos comuns no Brasil
// — no mesmo espírito da tabela TACO, mas não é um dump literal do dataset
// oficial. Cobre o suficiente pra um diário alimentar do dia a dia; alimentos
// que faltarem o usuário cadastra como "meu alimento" (customFoods).

const TACO_FOODS = [
  // ---------- Cereais, pães e massas ----------
  { key: 'arroz_branco_cozido', name: 'Arroz branco cozido', kcal: 128, proteinG: 2.5, carbG: 28.1, fatG: 0.2, per: '100g' },
  { key: 'arroz_integral_cozido', name: 'Arroz integral cozido', kcal: 124, proteinG: 2.6, carbG: 25.8, fatG: 1.0, per: '100g' },
  { key: 'macarrao_cozido', name: 'Macarrão cozido', kcal: 158, proteinG: 5.8, carbG: 30.9, fatG: 1.0, per: '100g' },
  { key: 'pao_frances', name: 'Pão francês', kcal: 300, proteinG: 8.0, carbG: 58.0, fatG: 3.1, per: '100g' },
  { key: 'pao_integral', name: 'Pão integral', kcal: 253, proteinG: 9.4, carbG: 49.9, fatG: 3.3, per: '100g' },
  { key: 'aveia_flocos', name: 'Aveia em flocos', kcal: 394, proteinG: 13.9, carbG: 67.0, fatG: 8.5, per: '100g' },
  { key: 'tapioca', name: 'Tapioca (goma hidratada)', kcal: 240, proteinG: 0.1, carbG: 59.0, fatG: 0.1, per: '100g' },
  { key: 'granola', name: 'Granola', kcal: 471, proteinG: 10.1, carbG: 66.0, fatG: 18.3, per: '100g' },
  { key: 'batata_doce_cozida', name: 'Batata-doce cozida', kcal: 77, proteinG: 0.6, carbG: 18.4, fatG: 0.1, per: '100g' },
  { key: 'batata_inglesa_cozida', name: 'Batata inglesa cozida', kcal: 52, proteinG: 1.2, carbG: 11.9, fatG: 0.1, per: '100g' },
  { key: 'mandioca_cozida', name: 'Mandioca cozida', kcal: 125, proteinG: 0.6, carbG: 30.1, fatG: 0.3, per: '100g' },
  { key: 'cuscuz_milho', name: 'Cuscuz de milho', kcal: 112, proteinG: 2.5, carbG: 24.6, fatG: 0.4, per: '100g' },
  { key: 'quinoa_cozida', name: 'Quinoa cozida', kcal: 120, proteinG: 4.4, carbG: 21.3, fatG: 1.9, per: '100g' },

  // ---------- Leguminosas ----------
  { key: 'feijao_carioca_cozido', name: 'Feijão carioca cozido', kcal: 76, proteinG: 4.8, carbG: 13.6, fatG: 0.5, per: '100g' },
  { key: 'feijao_preto_cozido', name: 'Feijão preto cozido', kcal: 77, proteinG: 4.5, carbG: 14.0, fatG: 0.5, per: '100g' },
  { key: 'lentilha_cozida', name: 'Lentilha cozida', kcal: 93, proteinG: 6.3, carbG: 16.3, fatG: 0.5, per: '100g' },
  { key: 'grao_de_bico_cozido', name: 'Grão-de-bico cozido', kcal: 121, proteinG: 6.7, carbG: 21.7, fatG: 1.7, per: '100g' },
  { key: 'ervilha_cozida', name: 'Ervilha cozida', kcal: 76, proteinG: 5.4, carbG: 12.8, fatG: 0.3, per: '100g' },
  { key: 'soja_cozida', name: 'Soja cozida', kcal: 173, proteinG: 16.6, carbG: 9.9, fatG: 9.0, per: '100g' },

  // ---------- Carnes e ovos ----------
  { key: 'peito_frango_grelhado', name: 'Peito de frango grelhado', kcal: 165, proteinG: 31.0, carbG: 0, fatG: 3.6, per: '100g' },
  { key: 'coxa_frango_assada', name: 'Coxa de frango assada', kcal: 200, proteinG: 26.0, carbG: 0, fatG: 10.0, per: '100g' },
  { key: 'carne_bovina_patinho', name: 'Carne bovina (patinho) grelhada', kcal: 219, proteinG: 35.9, carbG: 0, fatG: 7.3, per: '100g' },
  { key: 'carne_bovina_acem_cozido', name: 'Carne bovina (acém) cozida', kcal: 212, proteinG: 26.7, carbG: 0, fatG: 11.0, per: '100g' },
  { key: 'carne_moida_magra', name: 'Carne moída magra refogada', kcal: 190, proteinG: 26.0, carbG: 0, fatG: 9.0, per: '100g' },
  { key: 'file_mignon_grelhado', name: 'Filé mignon grelhado', kcal: 213, proteinG: 32.0, carbG: 0, fatG: 8.5, per: '100g' },
  { key: 'lombo_suino_assado', name: 'Lombo suíno assado', kcal: 210, proteinG: 28.0, carbG: 0, fatG: 10.0, per: '100g' },
  { key: 'bacon', name: 'Bacon frito', kcal: 541, proteinG: 37.0, carbG: 1.4, fatG: 42.0, per: '100g' },
  { key: 'tilapia_grelhada', name: 'Tilápia grelhada', kcal: 129, proteinG: 26.2, carbG: 0, fatG: 2.7, per: '100g' },
  { key: 'salmao_grelhado', name: 'Salmão grelhado', kcal: 208, proteinG: 25.4, carbG: 0, fatG: 11.4, per: '100g' },
  { key: 'atum_lata_agua', name: 'Atum em lata (água)', kcal: 116, proteinG: 25.5, carbG: 0, fatG: 1.0, per: '100g' },
  { key: 'camarao_cozido', name: 'Camarão cozido', kcal: 99, proteinG: 20.9, carbG: 0.9, fatG: 1.1, per: '100g' },
  { key: 'ovo_cozido', name: 'Ovo de galinha cozido', kcal: 155, proteinG: 13.0, carbG: 1.1, fatG: 11.0, per: '100g' },
  { key: 'ovo_frito', name: 'Ovo de galinha frito', kcal: 196, proteinG: 15.0, carbG: 0.6, fatG: 15.0, per: '100g' },
  { key: 'clara_ovo', name: 'Clara de ovo', kcal: 52, proteinG: 10.9, carbG: 0.7, fatG: 0.2, per: '100g' },

  // ---------- Laticínios ----------
  { key: 'leite_integral', name: 'Leite integral', kcal: 61, proteinG: 3.2, carbG: 4.5, fatG: 3.3, per: '100ml' },
  { key: 'leite_desnatado', name: 'Leite desnatado', kcal: 35, proteinG: 3.4, carbG: 4.9, fatG: 0.2, per: '100ml' },
  { key: 'iogurte_natural', name: 'Iogurte natural integral', kcal: 61, proteinG: 3.5, carbG: 4.7, fatG: 3.0, per: '100g' },
  { key: 'iogurte_grego', name: 'Iogurte grego natural', kcal: 97, proteinG: 9.0, carbG: 4.0, fatG: 5.0, per: '100g' },
  { key: 'queijo_minas_frescal', name: 'Queijo minas frescal', kcal: 264, proteinG: 17.4, carbG: 3.2, fatG: 20.2, per: '100g' },
  { key: 'queijo_mussarela', name: 'Queijo muçarela', kcal: 330, proteinG: 22.6, carbG: 3.0, fatG: 25.2, per: '100g' },
  { key: 'requeijao', name: 'Requeijão cremoso', kcal: 264, proteinG: 9.6, carbG: 3.0, fatG: 23.0, per: '100g' },
  { key: 'cottage', name: 'Queijo cottage', kcal: 98, proteinG: 11.1, carbG: 3.4, fatG: 4.3, per: '100g' },
  { key: 'manteiga', name: 'Manteiga', kcal: 726, proteinG: 0.4, carbG: 0.1, fatG: 82.4, per: '100g' },

  // ---------- Frutas ----------
  { key: 'banana_prata', name: 'Banana prata', kcal: 98, proteinG: 1.3, carbG: 26.0, fatG: 0.1, per: '100g' },
  { key: 'banana_nanica', name: 'Banana nanica', kcal: 92, proteinG: 1.4, carbG: 23.8, fatG: 0.1, per: '100g' },
  { key: 'maca', name: 'Maçã', kcal: 56, proteinG: 0.3, carbG: 15.2, fatG: 0.2, per: '100g' },
  { key: 'mamao', name: 'Mamão', kcal: 40, proteinG: 0.5, carbG: 10.4, fatG: 0.1, per: '100g' },
  { key: 'laranja', name: 'Laranja', kcal: 46, proteinG: 0.9, carbG: 11.5, fatG: 0.1, per: '100g' },
  { key: 'morango', name: 'Morango', kcal: 30, proteinG: 0.9, carbG: 6.8, fatG: 0.3, per: '100g' },
  { key: 'abacaxi', name: 'Abacaxi', kcal: 48, proteinG: 0.9, carbG: 12.3, fatG: 0.1, per: '100g' },
  { key: 'manga', name: 'Manga', kcal: 64, proteinG: 0.4, carbG: 16.7, fatG: 0.2, per: '100g' },
  { key: 'melancia', name: 'Melancia', kcal: 33, proteinG: 0.9, carbG: 8.1, fatG: 0.0, per: '100g' },
  { key: 'uva', name: 'Uva', kcal: 53, proteinG: 0.7, carbG: 13.5, fatG: 0.2, per: '100g' },
  { key: 'abacate', name: 'Abacate', kcal: 96, proteinG: 1.2, carbG: 6.0, fatG: 8.4, per: '100g' },

  // ---------- Verduras e legumes ----------
  { key: 'alface', name: 'Alface', kcal: 15, proteinG: 1.4, carbG: 2.4, fatG: 0.2, per: '100g' },
  { key: 'tomate', name: 'Tomate', kcal: 18, proteinG: 0.9, carbG: 3.9, fatG: 0.2, per: '100g' },
  { key: 'cenoura_crua', name: 'Cenoura crua', kcal: 34, proteinG: 1.3, carbG: 7.7, fatG: 0.2, per: '100g' },
  { key: 'brocolis_cozido', name: 'Brócolis cozido', kcal: 25, proteinG: 2.1, carbG: 4.4, fatG: 0.5, per: '100g' },
  { key: 'couve_refogada', name: 'Couve refogada', kcal: 60, proteinG: 1.9, carbG: 5.5, fatG: 4.0, per: '100g' },
  { key: 'abobrinha_cozida', name: 'Abobrinha cozida', kcal: 19, proteinG: 1.2, carbG: 4.3, fatG: 0.2, per: '100g' },
  { key: 'pepino', name: 'Pepino', kcal: 10, proteinG: 0.9, carbG: 1.6, fatG: 0.1, per: '100g' },
  { key: 'cebola', name: 'Cebola', kcal: 39, proteinG: 1.4, carbG: 8.9, fatG: 0.1, per: '100g' },
  { key: 'beterraba_cozida', name: 'Beterraba cozida', kcal: 32, proteinG: 1.3, carbG: 7.3, fatG: 0.1, per: '100g' },

  // ---------- Oleaginosas e gorduras ----------
  { key: 'castanha_para', name: 'Castanha-do-pará', kcal: 656, proteinG: 14.5, carbG: 12.3, fatG: 63.5, per: '100g' },
  { key: 'castanha_caju', name: 'Castanha de caju', kcal: 570, proteinG: 18.5, carbG: 29.1, fatG: 46.3, per: '100g' },
  { key: 'amendoim', name: 'Amendoim torrado', kcal: 544, proteinG: 27.2, carbG: 20.3, fatG: 43.9, per: '100g' },
  { key: 'pasta_amendoim', name: 'Pasta de amendoim', kcal: 588, proteinG: 25.1, carbG: 20.0, fatG: 50.0, per: '100g' },
  { key: 'amendoas', name: 'Amêndoas', kcal: 579, proteinG: 21.2, carbG: 21.7, fatG: 49.9, per: '100g' },
  { key: 'azeite_oliva', name: 'Azeite de oliva', kcal: 884, proteinG: 0, carbG: 0, fatG: 100.0, per: '100ml' },
  { key: 'oleo_soja', name: 'Óleo de soja', kcal: 884, proteinG: 0, carbG: 0, fatG: 100.0, per: '100ml' },
  { key: 'oleo_coco', name: 'Óleo de coco', kcal: 862, proteinG: 0, carbG: 0, fatG: 100.0, per: '100ml' },

  // ---------- Açúcares e doces ----------
  { key: 'acucar_refinado', name: 'Açúcar refinado', kcal: 387, proteinG: 0, carbG: 99.9, fatG: 0, per: '100g' },
  { key: 'mel', name: 'Mel', kcal: 309, proteinG: 0.4, carbG: 84.0, fatG: 0, per: '100g' },
  { key: 'chocolate_ao_leite', name: 'Chocolate ao leite', kcal: 540, proteinG: 7.3, carbG: 58.0, fatG: 30.0, per: '100g' },
  { key: 'chocolate_amargo_70', name: 'Chocolate amargo 70%', kcal: 546, proteinG: 8.0, carbG: 39.0, fatG: 42.0, per: '100g' },
  { key: 'sorvete_creme', name: 'Sorvete de creme', kcal: 207, proteinG: 3.5, carbG: 24.0, fatG: 11.0, per: '100g' },

  // ---------- Bebidas ----------
  { key: 'suco_laranja_natural', name: 'Suco de laranja natural', kcal: 45, proteinG: 0.7, carbG: 10.4, fatG: 0.2, per: '100ml' },
  { key: 'refrigerante_cola', name: 'Refrigerante de cola', kcal: 42, proteinG: 0, carbG: 10.5, fatG: 0, per: '100ml' },
  { key: 'cerveja_pilsen', name: 'Cerveja pilsen', kcal: 41, proteinG: 0.5, carbG: 3.2, fatG: 0, per: '100ml' },
  { key: 'cafe_sem_acucar', name: 'Café sem açúcar', kcal: 2, proteinG: 0.1, carbG: 0.3, fatG: 0, per: '100ml' },

  // ---------- Suplementos ----------
  { key: 'whey_protein', name: 'Whey protein (pó)', kcal: 400, proteinG: 80.0, carbG: 8.0, fatG: 6.0, per: '100g' },
  { key: 'albumina', name: 'Albumina (pó)', kcal: 372, proteinG: 84.0, carbG: 4.0, fatG: 0, per: '100g' },
  { key: 'creatina', name: 'Creatina monohidratada', kcal: 0, proteinG: 0, carbG: 0, fatG: 0, per: '100g' },
  { key: 'barra_proteina', name: 'Barra de proteína', kcal: 380, proteinG: 30.0, carbG: 35.0, fatG: 12.0, per: '100g' },
];

module.exports = { TACO_FOODS };
